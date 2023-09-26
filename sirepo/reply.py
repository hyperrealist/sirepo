# -*- coding: utf-8 -*-
"""Reply hold the response to API calls.

Replies are independent of the web platform (tornado or flask). They
are converted to the native format by the platform dispatcher at the
time. Internal call_api returns an `_SReply` object.

:copyright: Copyright (c) 2023 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html

"""
from pykern import pkcompat
from pykern import pkconfig
from pykern import pkconst
from pykern import pkio
from pykern import pkjinja
from pykern import pkjson
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdexc, pkdlog, pkdp, pkdformat
import email.utils
import mimetypes
import pykern.pkinspect
import re
import sirepo.const
import sirepo.html
import sirepo.resource
import sirepo.uri
import sirepo.util

#: data.state for srException
SR_EXCEPTION_STATE = "srException"

SERVER_ERROR_ROUTE = "error"

#: mapping of extension (json, js, html) to MIME type
_MIME_TYPE = None

_MIME_TYPE_UTF8 = None

#: default Max-Age header
CACHE_MAX_AGE = 43200

ERROR_STATE = "error"

STATE = "state"

#: Default response
_RESPONSE_OK = PKDict({STATE: "ok"})

_DISPOSITION = "Content-Disposition"


def init_module(**imports):
    global _MIME_TYPE, _MIME_TYPE_UTF8

    if _MIME_TYPE:
        return

    # import simulation_db
    sirepo.util.setattr_imports(imports)
    _MIME_TYPE = PKDict(
        html="text/html",
        ipynb="application/x-ipynb+json",
        js="application/javascript",
        json=pkjson.MIME_TYPE,
        jsonld="application/ld+json",
        madx="text/plain",
        py="text/x-python",
        rtf="application/rtf",
        txt="text/plain",
    )
    _MIME_TYPE_UTF8 = frozenset(_MIME_TYPE.values())


def init_quest(qcall):
    qcall.attr_set("sreply", _SReply(qcall=qcall))


class _SReply(sirepo.quest.Attr):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Needed in tornado_response, after _SRequest is destroyed
        self._internal_req = self.qcall.sreq.internal_req
        self._cookies_to_delete = None

    def content_as_object(self):
        return self._content_as(_Object).value

    def content_as_redirect(self):
        return self._content_as(_Redirect).value

    def content_as_str(self):
        return self._content_as(str)

    def cookie_set(self, **kwargs):
        assert "key" in kwargs
        assert "value" in kwargs
        self.__attrs.cookie = PKDict(kwargs)
        return self

    def delete_third_party_cookies(self, names_and_paths):
        if self._cookies_to_delete is not None:
            raise AssertionError(
                f"setting names_and_paths={names_and_paths} but found existing _cookies_to_delete={self._cookies_to_delete}"
            )
        self._cookies_to_delete = names_and_paths

    def destroy(self, **kwargs):
        """Must be called"""
        try:
            self.__attrs.pknested_get("content.handle").close()
            self.__attrs.content.pkdel("handle")
        except Exception:
            pass

    def flask_response(self, cls):
        from werkzeug import utils
        from flask import request

        def _cache_control(resp):
            if "cache" not in self.__attrs:
                return resp
            c = self.__attrs.cache
            if c.cache:
                resp.cache_control.max_age = CACHE_MAX_AGE
                resp.headers["Cache-Control"] = "private, max-age=43200"
                if c.mtime is not None:
                    resp.headers["Last-Modified"] = email.utils.formatdate(
                        c.mtime,
                        usegmt=True,
                    )
            else:
                resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                resp.headers["Pragma"] = "no-cache"
            return resp

        def _delete_cookies(resp):
            for n, p in self.pkdel(self._cookies_to_delete) or ():
                resp.delete_cookie(
                    n,
                    path=p,
                )

        def _file():
            # Takes over some of the work for werkzeug.send_file
            c = self.__attrs.content
            res = utils.send_file(
                c.handle,
                environ=request.environ,
                mimetype=self.__attrs.content_type,
                download_name=self.__attrs.download_name,
                last_modified=c.mtime,
            )
            c.pkdel("handle")
            res.headers["Content-Encoding"] = c.encoding
            res.content_length = c.length
            return res

        a = self.__attrs
        c = a.get("content", "")
        if isinstance(c, _File):
            r = _file()
        else:
            if isinstance(c, _Base):
                c, a.content_type = c.http_response(self)
            r = cls(
                response=c,
                mimetype=a.get("content_type"),
                status=a.get("status"),
            )
        r.headers.update(a.headers)
        if "cookie" in a and 200 <= r.status_code < 400:
            r.set_cookie(**a.cookie)
            _delete_cookies(r)
        return _cache_control(r)

    def from_kwargs(self, **kwargs):
        """Saves reply attributes

        While replies are global (qcall.sreply), the attributes need
        to be reset every time a new reply is generated.
        """
        self.destroy()
        self.__attrs = PKDict(kwargs).pksetdefault(headers=PKDict)
        return self

    def gen_exception(self, exc):
        """Generate from an Exception

        Args:
            exc (Exception): valid convert into a response
        """
        # If an exception occurs here, we'll fall through
        # to the server, which will have code to handle this case.
        try:
            if isinstance(exc, sirepo.util.ReplyExc):
                return self._gen_exception_reply(exc)
            return self._gen_exception_error(exc)
        except Exception as e:
            pkdlog("exception={} trying to generate exc={} stack={}", e, exc, pkdexc())
            return self._gen_exception_reply_SRException(
                PKDict(routeName=SERVER_ERROR_ROUTE)
            )

    def gen_file(self, path, filename):
        # Always (re-)initialize __attrs
        self.from_kwargs()
        try:
            e = None
            self.__attrs.content_type, e = self._guess_content_type(path.basename)
            self._download_name(filename or path.basename)
            self.__attrs.content = _File(
                encoding=e,
                length=path.size(),
                mtime=int(path.mtime()),
                path=path,
            )
            # Need a handle, because path may get deleted before response.
            # Here to avoid unclosed handles on exceptions.
            self.__attrs.content.handle = open(path, "rb")
            return self
        except Exception:
            self.__attrs.pkdel("content")
            self.__attrs.pkdel("content_type")
            self.__attrs.pkdel("download_name")
            raise

    def gen_attachment(self, content_or_path, filename=None):
        """Generate an attachment from file or content

        Args:
            content_or_path (bytes or py.path): File contents
            filename (str): Name of file [content_or_path.basename]

        Returns:
            _SReply: reply object
        """

        def _reply(filename):
            if isinstance(content_or_path, pkconst.PY_PATH_LOCAL_TYPE):
                return self.gen_file(path=content_or_path, filename=filename)
            self.from_kwargs(
                content=content_or_path,
                content_type=self._guess_content_type(filename)[0],
            )
            self._download_name(filename)
            return self

        return _reply(filename)._disposition("attachment").headers_for_no_cache()

    def gen_dict(self, value):
        """Generate dict response

        Args:
            value (dict): response content
        Returns:
            _SReply: reply object
        """
        assert isinstance(value, dict), f"value type={type(value)} is not dict"
        if value.get(STATE) == SR_EXCEPTION_STATE:
            # job_api calls return a dict for an srException from job_agent
            # so need convert to back to srException object.
            value[SR_EXCEPTION_STATE].pksetdefault(
                sim_type=lambda: self.qcall.sim_type_uget(),
            )
            return self._gen_exception_reply_SRException(value[SR_EXCEPTION_STATE])
        return self.from_kwargs(content=_Object(value))

    def gen_dict_ok(self, value):
        """Generate state=ok dict response

        Args:
            value (dict): other values to set (NOTE: updated without copying)
        Returns:
            _SReply: reply object
        """
        if value is None:
            return self.gen_dict(_RESPONSE_OK)
        value.update(_RESPONSE_OK)
        return self.gen_dict(value)

    def gen_list_deprecated(self, value):
        """Generate list response

        DEPRECATED: always should reply_dict

        Args:
            value (list): response content
        Returns:
            _SReply: reply object
        """
        assert isinstance(value, list), f"value type={type(value)} is not list"
        return self.from_kwargs(content=_Object(value))

    def gen_redirect(self, uri):
        """Redirect to uri

        Args:
            uri (str): any valid uri (even with anchor)
        Returns:
            _SReply: reply object
        """
        return self._gen_redirect_for_anchor(uri)

    def gen_redirect_for_local_route(
        self,
        sim_type=None,
        route=None,
        params=None,
        query=None,
        **kwargs,
    ):
        """Generate a javascript redirect to sim_type/route/params

        Default route (None) only supported for ``default``
        application_mode/appMode.

        Args:
            sim_type (str): how to find the schema [qcall.sim_type]
            route (str): name in localRoutes [None: use default route]
            params (dict): parameters for route (including :Name)

        Returns:
            _SReply: reply object
        """
        return self._gen_redirect_for_anchor(
            sirepo.uri.local_route(
                self.qcall.sim_type_uget(sim_type), route, params, query
            ),
            **kwargs,
        )

    def header_set(self, name, value):
        self.__attrs.headers[name] = value
        return self

    def headers_for_cache(self, path=None):
        self.__attrs.cache = PKDict(cache=True, mtime=path and path.mtime())
        return self

    def headers_for_no_cache(self):
        self.__attrs.cache = PKDict(cache=False)
        return self

    def init_child(self, qcall):
        """Initialize child from parent (self)"""
        # nothing to do with parent
        init_quest(qcall)

    def pkdebug_str(self):
        n = self.__class__.__name__
        a = self.__attrs
        if not a:
            return n + "()"
        c = a.get("content")
        return pkdformat(
            "{}(content={} content_type={})",
            n,
            # TODO(robnagler) more info by using pkdebug_str for content
            c if isinstance(c, str) else ("<" + str(type(c)) + ">"),
            a.get("content_type"),
        )

    def render_html(self, path, want_cache=True, attrs=None):
        """Call sirepo.html.render with path

        Args:
            path (py.path): sirepo.html file to render
            want_cache (bool): whether to cache result
            kwargs (dict): params to p

        Returns:
            _SReply: reply
        """
        r = self.from_kwargs(
            content=sirepo.html.render(path),
            content_type=_MIME_TYPE.html,
            **(attrs or PKDict()),
        )
        return (
            r.headers_for_cache(path=path) if want_cache else r.headers_for_no_cache()
        )

    def render_static_jinja(self, base, ext, j2_ctx):
        """Render static template with jinja

        Args:
            base (str): base name of file, e.g. ``user-state``
            ext (str): suffix of file, e.g. ``js``
            j2_ctx (dict): jinja context
            cache_ok (bool): OK to cache the result? [default: False]

        Returns:
            _SReply: reply
        """
        p = sirepo.resource.static(ext, f"{base}.{ext}")
        r = self.from_kwargs(
            content=pkjinja.render_file(p, j2_ctx, strict_undefined=True),
            content_type=_MIME_TYPE[ext],
        )
        return r.headers_for_no_cache()

    def status_set(self, status):
        self.__attrs.status = int(status)
        return self

    def tornado_response(self):
        def _bytes(resp, content):
            if isinstance(content, _Base):
                content, self.__attrs.content_type = content.http_response(self)
            c = pkcompat.to_bytes(content)
            resp.write(c)
            resp.set_header("Content-Length", str(len(c)))

        def _cache_control(resp):
            if "cache" not in self.__attrs:
                return resp
            c = self.__attrs.cache
            if c.cache:
                resp.set_header(
                    "Cache-Control",
                    f"private, max-age={CACHE_MAX_AGE}",
                )
                if c.mtime is not None:
                    resp.set_header(
                        "Last-Modified",
                        email.utils.formatdate(c.mtime, usegmt=True),
                    )
            else:
                resp.set_header("Cache-Control", "no-cache, no-store, must-revalidate")
                resp.set_header("Pragma", "no-cache")

        def _content_type(resp):
            c = a.content_type
            if self._mime_type_is_utf8(c):
                c += '; charset="utf8"'
            r.set_header("Content-Type", c)

        def _cookie(resp):
            # TODO(robnagler) http.cookies 3.8 introduced samesite and blows up otherwise.
            # we know how our cookies are formed so
            a = self.__attrs
            if not ("cookie" in a and 200 <= a.status < 400):
                return
            c = a.cookie
            r = [f'{c.pkdel("key")}={c.pkdel("value")}', "Path=/"]
            for k in sorted(c.keys()):
                if k == "httponly":
                    if c[k]:
                        r.append("HttpOnly")
                elif k == "max_age":
                    r.append(f"Max-Age={c[k]}")
                elif k == "samesite":
                    r.append(f"SameSite={c[k]}")
                elif k == "secure":
                    if c[k]:
                        r.append("Secure")
                else:
                    raise AssertionError(f"unhandled cookie attr={k}")
            resp.set_header("Set-Cookie", "; ".join(r))
            _cookie_aux_delete(resp)

        def _cookie_aux_delete(resp):
            for n, p in self.pkdel(self._cookies_to_delete) or ():
                resp.clear_cookie(
                    n,
                    path=p,
                )

        def _file(resp):
            a = self.__attrs
            c = a.content
            resp.write(c.handle.read())
            c.handle.close()
            c.pkdel("handle")
            if _DISPOSITION not in a.headers:
                self._disposition("inline")
            resp.set_header(
                "Last-Modified",
                email.utils.formatdate(c.mtime, usegmt=True),
            )
            if c.encoding:
                resp.set_header("Content-Encoding", c.encoding)
            resp.set_header("Content-Length", str(c.length))

        a = self.__attrs
        c = a.get("content")
        if c is None:
            c = b""
            a.content_type = _MIME_TYPE.txt
        r = self._internal_req
        if isinstance(c, _File):
            _file(r)
        else:
            _bytes(r, c)
        a.pksetdefault(status=200)
        r.set_status(a.status)
        for k, v in a.headers.items():
            r.set_header(k, v)
        _content_type(r)
        _cache_control(r)
        _cookie(r)
        return r

    def uri_router_process_api_call(self, res):
        """Process the reply from an API call by uri_router

        Destructively copies `res` to `self` if res is an`_SReply`
        """
        if isinstance(res, _SReply):
            return self._copy(res)
        if isinstance(res, dict):
            return self.gen_dict(res)
        raise AssertionError(f"invalid return type={type(res)} from qcall={self.qcall}")

    async def websocket_response(self):
        import msgpack

        def _content():
            a = self.__attrs
            c = a.get("content")
            k = sirepo.const.SCHEMA_COMMON.websocketMsg.kind.httpReply
            if c is None:
                # always have content, easier for clients
                return "", k
            elif isinstance(c, _File):
                # TODO(robnagler) would be ideal to handle this differently, but
                # it may not be possible. Tornado/msgpack has lots of copying.
                x = c.handle.read()
                c.handle.close()
                c.pkdel("handle")
                if self._mime_type_is_utf8(a.content_type):
                    x = pkcompat.from_bytes(x)
                return x, k
            elif isinstance(c, _Base):
                return c.websocket_content()
            else:
                return c, k

        async def _send(content, kind):
            p = None
            try:
                p = msgpack.Packer(autoreset=False)
                p.pack(
                    PKDict(
                        kind=kind,
                        reqSeq=self._internal_req.req_seq,
                        version=sirepo.const.SCHEMA_COMMON.websocketMsg.version,
                    ),
                )
                p.pack(content)
                # TODO(robnagler) getbuffer() would be better
                await self._internal_req.handler.write_message(p.bytes(), binary=True)
            finally:
                if p:
                    p.reset()

        try:
            self._assert_no_cookie_ops()
            await _send(*_content())
        except Exception as e:
            pkdlog("error={} in reply={}", e, self)
            await _send(
                PKDict(routeName=SERVER_ERROR_ROUTE, params=PKDict()),
                sirepo.const.SCHEMA_COMMON.websocketMsg.kind.srException,
            )

    def _assert_no_cookie_ops(self):
        if self.get("_cookies_to_delete"):
            raise AssertionError(f"cannot delete cookies for nested request")
        if self.pkunchecked_nested_get(("__attrs", "cookie")):
            raise AssertionError(f"cannot add cookies for nested request")

    def _content_as(self, clazz):
        res = self.__attrs.get("content")
        if not isinstance(res, clazz):
            raise AssertionError(f"unexpected reply type={type(res)}")
        return res

    def _copy(self, source):
        """Destructive copy source unless `self` is `source`"""
        if source is self:
            return self
        self._assert_no_cookie_ops()
        res = self.from_kwargs(**source.__attrs)
        # Destructive so "handle" not used by caller
        source.__attrs = None
        return res

    def _disposition(self, disposition):
        self.header_set(
            _DISPOSITION, f'{disposition}; filename="{self.__attrs.download_name}"'
        )
        return self

    def _download_name(self, filename):
        def _secure_filename():
            return re.sub(r"[^\w\.]+", "-", filename).strip("-")

        f = _secure_filename()
        if f.startswith("."):
            # the safe filename has no basename, prefix with "download"
            f = "download" + f
        self.__attrs.download_name = f

    def _gen_exception_error(self, exc):
        pkdlog("unsupported exception={} msg={}", type(exc), exc)
        return self._gen_exception_reply_ServerError(None)

    def _gen_exception_base(self, exc):
        return self._gen_exception_reply(exc)

    def _gen_exception_reply(self, exc):
        f = getattr(
            self,
            "_gen_exception_reply_" + exc.__class__.__name__,
            None,
        )
        pkdc("exception={} sr_args={}", exc, exc.sr_args)
        if not f:
            return self._gen_exception_error(exc)
        return f(exc.sr_args)

    def _gen_exception_reply_BadRequest(self, args):
        return self._gen_http_exception(400)

    def _gen_exception_reply_ContentTooLarge(self, args):
        return self._gen_http_exception(413)

    def _gen_exception_reply_Error(self, args):
        return self.from_kwargs(content=_Error(args))

    def _gen_exception_reply_Forbidden(self, args):
        return self._gen_http_exception(403)

    def _gen_exception_reply_NotFound(self, args):
        return self._gen_http_exception(404)

    def _gen_exception_reply_Redirect(self, args):
        return self.gen_redirect(args.uri)

    def _gen_exception_reply_SReplyExc(self, args):
        r = args.sreply
        if r is self:
            return self
        return self.from_kwargs(**r.__attrs)

    def _gen_exception_reply_ServerError(self, args):
        return self._gen_http_exception(500)

    def _gen_exception_reply_SPathNotFound(self, args):
        pkdlog("uncaught SPathNotFound {}", args)
        return self._gen_http_exception(404)

    def _gen_exception_reply_SRException(self, args):
        if args.get("params") is None:
            args.params = PKDict()
        args.pksetdefault(sim_type=lambda: self.qcall.sim_type_uget())
        return self.from_kwargs(content=_SRException(args))

    def _gen_exception_reply_Unauthorized(self, args):
        return self._gen_http_exception(401)

    def _gen_exception_reply_UserDirNotFound(self, args):
        return self.qcall.auth.user_dir_not_found(**args)

    def _gen_exception_reply_UserAlert(self, args):
        return self._gen_exception_reply_Error(args)

    def _gen_exception_reply_WWWAuthenticate(self, args):
        return self._gen_http_exception(
            401, headers=PKDict({"WWW-Authenticate": 'Basic realm="*"'})
        )

    def _gen_http_exception(self, code, headers=None):
        return self.from_kwargs(
            content=_HTTPException(PKDict(code=code, headers=headers))
        )

    def _gen_redirect_for_anchor(self, uri, **kwargs):
        """Redirect uri with an anchor using javascript

        Safari browser doesn't support redirects with anchors so we do this
        in all cases. It also allows us to return sr_exception to the app
        when we don't know if we can.

        Args:
            uri (str): where to redirect to
        Returns:
            _SReply: reply object
        """
        return self.from_kwargs(
            content=_Redirect(
                PKDict(
                    uri=uri,
                    sim_type=self.qcall.sim_type_uget(),
                    **kwargs,
                ),
            ),
        )

    def _guess_content_type(self, basename):
        res = mimetypes.guess_type(basename)
        if res[0] is None:
            return "application/octet-stream", None
        # overrule mimetypes for this case
        elif res[0] == "text/x-python":
            return "text/plain", res[1]
        return res

    def _mime_type_is_utf8(self, content_type):
        return content_type in _MIME_TYPE_UTF8 or content_type.startswith("text/")


class _Base:
    def __init__(self, value):
        self.value = value

    def _http_error(self, code, sreply, error_detail=None):
        x = simulation_db.SCHEMA_COMMON.customErrors.get(str(code))
        j = PKDict(error_detail=error_detail)
        if x:
            try:
                # inject the error in the html without jinja or simply generate from a different template
                # with a title and the respective error.
                # check self.value.error or have it passed explicitly
                j.body = sirepo.html.render(
                    path=sirepo.resource.static("html", x["url"])
                )
            except Exception as e:
                pkdlog(
                    "customErrors code={} render error={} stack={}", code, e, pkdexc()
                )
        if "body" not in j:
            j.body = f"<h1>HTTP Error {code}</h1><p>The server could not process your request</p>"
        sreply.status_set(code)
        return self._jinja_html("http-custom-error", j2_ctx=j, sreply=sreply)

    def _jinja_html(self, basename, j2_ctx, sreply):
        sreply.headers_for_no_cache()
        return (
            pkjinja.render_file(
                sirepo.resource.file_path(basename + ".html.jinja"),
                j2_ctx=j2_ctx,
                strict_undefined=True,
            ),
            _MIME_TYPE.html,
        )

    def _json(self, value):
        return pkjson.dump_pretty(value, pretty=False), _MIME_TYPE.json

    def _redirect_html(self, value, sreply):
        j = PKDict(redirect_uri=value.uri, **value)
        if "sr_exception" in j:
            j.sr_exception = pkjson.dump_pretty(j.sr_exception, pretty=False)
        return self._jinja_html("javascript-redirect", j2_ctx=j, sreply=sreply)

    def _sr_exception(self, routeName, params, **kwargs):
        # Only supply parameters that match the localRoute, and simulationType
        # is not in any localRoutes. It's added automatically to params in
        # certain cases.
        # TODO(robnagler) this probably should be an assert
        params.pkdel("simulationType")
        return (
            PKDict(routeName=routeName, params=params),
            sirepo.const.SCHEMA_COMMON.websocketMsg.kind.srException,
        )

    def _value(self, value=None):
        return (
            self.value if value is None else value,
            sirepo.const.SCHEMA_COMMON.websocketMsg.kind.httpReply,
        )


class _File(PKDict):
    pass


class _Error(_Base):
    def http_response(self, sreply):
        if sreply.qcall.sreq.method_is_post() and not sreply.qcall.sreq.is_spider():
            return self._json(self.websocket_content()[0])
        return self._http_error(500, sreply, self.value.error)

    def websocket_content(self):
        return self._value(
            value=PKDict({STATE: ERROR_STATE, ERROR_STATE: self.value.error})
        )


class _HTTPException(_Base):
    def http_response(self, sreply):
        if self.value.headers:
            for k, v in self.value.headers.items():
                sreply.header_set(k, v)
        return self._http_error(self.value.code, sreply)

    def websocket_content(self):
        return self._sr_exception(
            routeName="httpException", params=PKDict(code=self.value.code)
        )


class _Object(_Base):
    def http_response(self, sreply):
        return self._json(self.value)

    def websocket_content(self):
        return self._value()


class _Redirect(_Base):
    def http_response(self, sreply):
        if not sreply.qcall.sreq.method_is_post():
            return self._redirect_html(self.value, sreply)
        return self._json(
            PKDict(
                {
                    STATE: SR_EXCEPTION_STATE,
                    SR_EXCEPTION_STATE: PKDict(
                        routeName="httpRedirect",
                        params=PKDict(uri=self.value.uri),
                    ),
                }
            ),
        )

    def websocket_content(self):
        return self._sr_exception(
            routeName="httpRedirect", params=PKDict(uri=self.value.uri)
        )


class _SRException(_Base):
    def __init__(self, value):
        self.value = value

    def http_response(self, sreply):
        def _sim_type():
            # Only supply parameters that match the localRoute, and simulationType
            # is not in localRoutes.
            x = self.value.params.pkdel("simulationType")
            y = self.value.pkdel("sim_type")
            return x or y

        t = _sim_type()
        s = simulation_db.get_schema(sim_type=t)
        r = self.value.routeName
        u = r and s.localRoutes.get(r)
        if not u:
            pkdlog("localRoute={} not found in schema for type={}", r, t)
            return self._http_error(500, sreply)
        if "srExceptionOnly" in u.route or sreply.qcall.sreq.method_is_post():
            return self._json(
                PKDict({STATE: SR_EXCEPTION_STATE, SR_EXCEPTION_STATE: self.value}),
            )
        pkdc("redirect to route={} params={} type={}", r, self.value.params, t)
        return self._redirect_html(
            PKDict(
                uri=sirepo.uri.local_route(t, r, self.value.params),
                sr_exception=self.value,
            ),
            sreply,
        )

    def websocket_content(self):
        return self._sr_exception(**self.value)
