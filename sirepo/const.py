# -*- coding: utf-8 -*-
"""Constant values

:copyright: Copyright (c) 2021 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
import asyncio
from pykern.pkcollections import PKDict

ASYNC_CANCELED_ERROR = asyncio.CancelledError

STATIC_D = "static"

REACT_ROOT_D = "react"

REACT_BUNDLE_FILE_PAT = rf"{STATIC_D}/(css|js)/main\."

JSON_SUFFIX = ".json"

# matches requirements for uid and isn't actually put in the db
MOCK_UID = "someuser"

MPI_LOG = "mpi_run.log"

PORT_MAX = 32767
PORT_MIN = 1025

PORT_DEFAULTS = PKDict(
    http=8000,
    jupyterhub=8002,
    nginx_proxy=8080,
    react=3000,
    supervisor=8001,
)

#: These values will be injected into simulation_db.SCHEMA_COMMON
SCHEMA_COMMON = PKDict(
    websocketMsg=PKDict(
        kind=PKDict(
            httpRequest=1,
            httpReply=2,
            srException=3,
        ),
        version=1,
    ),
)

TEST_PORT_RANGE = range(10000, 11000)

SRUNIT_USER_AGENT = "srunit/1.0"
