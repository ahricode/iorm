import { IFieldGenerate, FieldProperty } from "../types/index"
import Field from "../base/field.js"


class Object extends Field {
    private readonly js_type: string = 'object'
    private readonly type: string = 'array'
    value: object = {}
    constructor(property: FieldProperty) {
        super(property)
        if (typeof property?.default != 'object') {
            throw new Error('ObjectField default value must be object')
        }
        this.value = property.default
    }
}

const ObjectField: IFieldGenerate = (property: FieldProperty) => {
    let value = new Object(property)
    return new Proxy(value, {
        get: function (target, prop) {
            return target[prop]
        },
        set: function (target, prop, value) {
            target[prop] = value
            return true
        }
    })
}

export default ObjectField
