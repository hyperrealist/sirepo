// will get rid of angular stuff but need it initially

class UIEnvironment {
    constructor(sanitizer=null) {
        this.sanitizer = sanitizer;
    }

    newInstance(className, ...args) {
        if (className === 'UIEnvironment') {
            return this;
        }
        //return new SIREPO.DOM[className](this, ...args);
        return new SIREPO.DOM[className](...args);
    }

    sanitize(str) {
        return this.sanitizer ? this.sanitizer(str) : str;
    }
}

// any UI stuff seen on screen
class UIOutput {
    constructor(env = null) {
        this.env = env;
    }

    encode(str) {
        const ENTITY_MAP = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
          '/': '&#x2F;',
          '`': '&#x60;',
          '=': '&#x3D;'
        };
        return String(str).replace(/[&<>"'`=\/]/g, function (s) {
            return ENTITY_MAP[s];
        });
    }


    sanitize(str) {
        return this.env.sanitize(str);
    }
}

class UIAttribute {  //extends UIOutput {
    constructor(name, value) {
        //super();
        this.name = name;
        this.value = value;
    }

    static attrsToTemplate(arr) {
        let s = '';
        for (let attr of arr) {
            s += `${attr.toTemplate()} `;
        }
        return s;
    }

    toTemplate() {
        //return `${this.encode(this.name)}="${this.encode(this.value)}"`;
        return `${this.name}="${this.value}"`;
    }
}

class UIElement {  //extends UIOutput {
    // tag name, id, attrs array
    // even though id is an attribute, give it its own parameter
    constructor(tag, id, attrs) {
        //super();
        //this.attrs = [];
        // key-value map to manage attributes
        //srdbg('bld el', tag, id, attrs);
        this.attrs = {};
        this.addAttributes(attrs || []);
        if (id) {
            this.addAttribute('id', id);
        }
        this.children = [];
        this.id = id;
        this.parent = null;
        this.siblings = [];
        this.tag = tag;
        this.text = '';
    }

    addAttribute(name, value) {
        let a = this.getAttr(name);
        //srdbg('got a', name, a);
        if (! a) {
            a = new UIAttribute(name, value);
            this.attrs[name] = a;
        }
        a.value = value;
    }

    addAttributes(arr) {
        for (let a of arr) {
            this.addAttribute(a.name, a.value);
        }
    }

    addChild(el) {
        el.parent = this;
        this.children.push(el);
        for (let s of el.siblings || []) {
            this.addChild(s);
        }
    }

    // add a class to the existing list, or set it.  Can be space-delimited
    // list
    addClasses(cl) {
        let a = this.getClasses();
        if (! a) {
            this.setClass(cl);
            return;
        }
        let arr = a.value.split(' ');
        if (arr.indexOf(cl) >= 0) {
            return;
        }
        arr.push(...cl.split(' '));
        this.setClass(arr.join(' '));
    }

    addSibling(el) {
        this.siblings.push(el);
        if (this.parent) {
            this.parent.addChild(el);
        }
    }

    getAttr(name) {
        return this.attrs[name];
    }

    getChild(id) {
        for (let x of this.children) {
            if (x.id === id) {
                return  x;
            }
        }
        return null;
    }

    // helper
    getClasses() {
        return this.getAttr('class');
    }

    getSibling(id) {
        for (let x of this.siblings) {
            if (x.id === id) {
                return  x;
            }
        }
        return null;
    }


    removeClasses(cl) {
        let a = this.getClasses();
        if (! a) {
            return;
        }
        let arr = a.value.split(' ');
        let clArr = cl.split(' ');
        for (let c of clArr) {
            let clIdx = arr.indexOf(c);
            if (clIdx >= 0) {
                arr.splice(clIdx, 1);
            }
        }
        this.setClass(arr.join(' '));
    }

    setClass(cl) {
        let a = this.getClasses();
        if (! a) {
            this.addAttribute('class', cl);
            return;
        }
        a.value = cl;
    }

    setText(str) {
        this.text = str;  //this.encode(str);
    }

    toTemplate() {
        let t = this.tag;  //this.encode(this.tag);
        let s = `<${t} ${UIAttribute.attrsToTemplate(Object.values(this.attrs))}>`;
        s += this.text;
        for (let c of this.children) {
            s += c.toTemplate();
        }
        s += `</${t}>`;
        for (let c of this.siblings) {
            s += c.toTemplate();
        }
        return s;
    }
}

// wrap an element with conditional element
class UIMatch extends UIElement {
    constructor(value, el) {
        super('div', null, [
            new UIAttribute('data-ng-switch-when', value),
            new UIAttribute('data-ng-class', 'fieldClass'),
        ]);
        this.addChild(el);
    }
}


// build selection DOM for an enum from the schema
class UIWarning extends UIElement {
    constructor(msg) {
        super('div', null, [
            new UIAttribute('class', 'sr-input-warning')
        ]);
        this.setMsg(msg || '');
    }

    setMsg(msg) {
        this.text = msg;
    }
}

class UIInput extends UIElement {
    constructor(tag, id, attrs) {
        super(tag, id, attrs);
        this.addSibling(new UIWarning());
    }
}

class UIEnum extends UIInput {
    static ENUM_LAYOUT_PROPS() {
        return {
            buttons: {
                entryClass: UIEnumButton,
                element: 'div',
                elementClasses: 'btn-group',
            },
            dropdown: {
                entryClass: UIEnumOption,
                element: 'select',
                elementClasses: 'form-control',
            },
        };
    }

    static enumMatch(name) {
        return new UIMatch(name, new UIEnum(new SIREPO.APP.SREnum(name)));
    }

    constructor(model) {
        const lp = UIEnum.ENUM_LAYOUT_PROPS();
        let props = lp[model.layout] || UIEnum.autoLayout(model);
        super(props.element, `sr-${SIREPO.UTILS.camelToKebabCase(model.name)}`);
        this.addClasses(props.elementClasses);
        if (model.layout === 'buttons') {
            this.addAttribute('data-ng-model', 'model[field]');
        }
        for (let e of model.entries) {
            this.addChild(new props.entryClass(e));
        }
    }

    // will need to know about the size of the columns etc. but for now just use number of
    // entries
    static autoLayout(model) {
        const lp = UIEnum.ENUM_LAYOUT_PROPS();
        if (model.entries.length < 4) {
            return lp.buttons;
        }
        else {
            return lp.dropdown;
        }
    }
}

class UIEnumButton extends UIElement {
    constructor(enumItem) {
        let v = `${enumItem.value}`;
        super('button', null, [
            new UIAttribute('class', 'btn sr-enum-button'),
            new UIAttribute('data-ng-click', `model[field] = '${v}'`),
            new UIAttribute(
                'data-ng-class',
                `{'active btn-primary': isSelectedValue('${v}'), 'btn-default': ! isSelectedValue('${v}')}`
            ),
        ]);
        this.setText(`${enumItem.label}`);
    }
}

class UIEnumOption extends UIElement {
    constructor(enumItem) {
        super('option');
        this.addAttribute('label', `${enumItem.label}`);
        this.addAttribute('value', `${enumItem.value}`);
    }
}



class SVGGroup extends UIElement {
    constructor(id) {
        super('g', id);
    }
}

class SVGRect extends UIElement {
    constructor(id, x, y, width, height, style) {
        //srdbg('rect args', arguments, 'vs', id, x, y, width, height, style);
        super('rect', id);
        //this.x = x;
        //this.y = y;
        //this.width = width;
        //this.height = height;
        //this.style = style;
        //for (let n of ['x', 'y', 'width', 'height', 'style']) {
        //    this.addAttribute(n, this[n]);
        //}
        this.update(x, y, width, height, style);
    }

    update(x, y, width, height, style) {
        //srdbg('rect update', arguments, 'vs', x, y, width, height, style);
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.style = style;
        for (let n of ['x', 'y', 'width', 'height', 'style']) {
            this.addAttribute(n, this[n]);
        }
    }

}


class SVGText extends UIElement {
    constructor(id, x, y, str = '') {
        super('text', id);
        this.addAttributes([
            new UIAttribute('x', x),
            new UIAttribute('y', y),
        ]);
        this.setText(str);
    }
}

// fixed size
class SVGTable extends SVGGroup {
    constructor(id, x, y, cellWidth, cellHeight, numRows, numCols) {
        if (! numCols || ! numRows) {
            throw new Error(`Table must have at least 1 row and 1 column (${numRows} x ${numCols} given)`);
        }
        //super(id, x, y, 0, 0, 'stroke:blue; fill:none');
        super(id);
        //this.addChild(
        //    new SVGRect(this.frameId(), x, y, 0, 0, 'stroke:blue; fill:none')
        //);
        //srdbg('table', this.attrs);
        this.padding = 2;
        this.cellWidth = cellWidth;
        this.cellHeight = cellHeight;
        this.numRows = numRows;
        this.numCols = numCols;
        this.cells = [];
        for (let i = 0; i < numRows; ++i) {
            let r = [];
            for (let j = 0; j < numCols; ++j) {
                r.push('');
                this.addChild(new SVGText(
                    this.cellId(i, j), this.padding + j * this.cellWidth, 10 + this.padding + i * this.cellHeight)
                );
            }
            this.cells.push(r);
        }
        this.update(x, y);
    }

    frameId() {
        return `${this.id}-frame`;
    }

    cellId(i, j) {
        return `${this.id}-${i}-${j}`;
    }

    getCell(i, j) {
        return this.cells[i][j];
    }

    setCell(i, j, val) {
        this.cells[i][j] = val;
        let cid  = this.cellId(i, j);
        let c = this.getChild(cid);
        //srdbg('set', i, j, cid, c, 'to', val);
        this.getChild(this.cellId(i, j)).setText(val);
        //srdbg('cell val now', this.getCell(i, j));
    }

    update(x, y) {
        //srdbg('table update', x, y, this.numCols, this.numRows, this.style);
        //this.getChild(this.frameId()).update(
        //    x,
        //    y,
        //    this.padding + this.numCols * (this.cellWidth + this.padding),
        //    this.padding + this.numRows * (this.cellHeight + this.padding),
        //    this.style
        //);
        /*
        for (let i = 0; i < this.numRows; ++i) {
            for (let j = 0; j < this.numCols; ++j) {
                let c = this.getSibling(this.cellId(i, j));
                let v = this.getCell(i, j);
                console.log('set cell', c, v);
                c.setText(v);
            }
        }
         */
    }

}

SIREPO.DOM = {
    SVGRect: SVGRect,
    SVGTable: SVGTable,
    SVGText: SVGText,
    UIAttribute: UIAttribute,
    UIMatch: UIMatch,
    UIElement: UIElement,
    UIEnum: UIEnum,
    UIEnumOption: UIEnumOption,
    UIEnvironment: UIEnvironment,
    UIInput: UIInput,
    UIWarning: UIWarning,
};
