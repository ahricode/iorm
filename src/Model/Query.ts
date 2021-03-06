import { IORMConfigDatabase, IORMConfigStore } from "../types/index"

export class QuerySet {
    private readonly object_model: any
    private whereOptions: any = {}
    private excludeOptions: any = {}
    private skip_count: number = -1
    private limit_count: number = -1
    private order_by: object | null | undefined = null
    private filterOptions: object | null | undefined = null
    key_path_field: string
    key_path_name: string
    constructor(object: any) {
        this.object_model = object
        this.key_path_field = this.object_model.get_key_path_field()
        this.key_path_name = this.object_model.key_path_name()
        return new Proxy(this, {
            get: (target, prop) => {
                return target[prop]
            },
            set: (target, prop, value) => {
                if (prop == 'object') {
                    throw new Error('Cannot set readonly property object')
                }
                target[prop] = value
                return true
            }
        })
    }

    async insert(data: any, ret: 'id' | 'data' | 'object' = 'id') {
        let object = this.object_model
        Object.getOwnPropertyNames(object).forEach(key => {
            if (object[key]?.hasOwnProperty('iorm_type') && object[key].iorm_type === 'field') {
                object[key] = data[key]
            }
        })
        return object.insert(data, ret)
    }

    where(where: object) {
        this.whereOptions = where
        return this
    }

    exclude(exclude: object) {
        this.excludeOptions = exclude
        return this
    }

    skip(skip: number) {
        if (typeof skip != 'number') {
            throw new Error('skip must be a number')
        }
        this.skip_count = skip
        return this
    }

    limit(limit: number) {
        if (typeof limit != 'number') {
            throw new Error('limit must be a number')
        }
        this.limit_count = limit
        return this
    }

    order(order: object) {
        this.order_by = order
        return this
    }

    filter(filter: object) {
        this.filterOptions = filter
        return this
    }

    db(val: string | IORMConfigDatabase | null | undefined = null) {
        if (val === null || val === undefined) {
            return this.object_model.db_name
        } else if (typeof val === 'string') {
            this.object_model.db_name = val
            return this
        } else {
            this.object_model.db_name = val.db_name
            this.object_model.db_version = val.db_version
            return this
        }
    }

    store(val: string | IORMConfigStore | null | undefined = null) {
        if (val === null || val === undefined) {
            return this.object_model.store_name
        } else if (typeof val === 'string') {
            this.object_model.store_name = val
            return this
        } else {
            this.object_model.store_name = val.store_name
            return this
        }
    }

    /**
     * ??????????????????
     * @param data ?????????
     * @param where ????????????
     * @returns ??????????????????
     */
    private __where_match(data: any, where: any) {
        let push_flag = true
        for (let k in where) {
            let tmp_data_value = k == this.key_path_field ? data.value[this.key_path_name] : data.value[k]

            if (tmp_data_value != where[k]) {
                return false
            }
        }
        return push_flag
    }

    /**
     * or ??????
     * @param data ?????????
     * @param where ????????????
     * @returns ??????????????????
     */
    private __where_or(data: any, where: any): boolean {
        for (let index = 0; index < where.length; index++) {
            if (this.__where_match(data, where[index])) {
                return true
            }
        }
        return false
    }

    /**
     * and ??????
     * @param data ?????????
     * @param where ????????????
     * @returns ??????????????????
     */
    private __where_and(data: any, where: any): boolean {
        for (let index = 0; index < where.length; index++) {
            if (!this.__where_match(data, where[index])) {
                return false
            }
        }
        return true
    }

    /**
     * ?????????????????????
     * @param data ?????????
     * @param where ???????????? ??? ????????????
     * @returns ??????????????????
     */
    private __where_and_exclude(data: any, where: any): boolean {
        let push_flag = true
        for (let k in where) {
            switch (k) {
                case '$or':
                    push_flag = this.__where_or(data, where[k])
                    break
                case '$and':
                    push_flag = this.__where_and(data, where[k])
                    break
                default:
                    push_flag = this.__where_match(data, where)
            }
        }
        return push_flag
    }

    /**
     * ?????? filter ??????????????????
     * @param data ?????????
     * @returns ??????????????????
     */
    private __filter(data: object): object {
        let tmp_data = {}
        for (let k in data) {
            if (this.filterOptions == null || this.filterOptions == undefined || this.filterOptions[k] == undefined || this.filterOptions[k] == 1) {
                tmp_data[k] = data[k]
            }
        }
        return tmp_data
    }

    private async __get(ret_type: string = 'data', only_one: boolean = false) {
        return new Promise(async (resolve, reject) => {
            if (this.object_model.db === null || this.object_model.db === undefined) {
                this.object_model.db = await this.object_model.__open() as IDBDatabase
            }
            let objectStore = this.object_model.db.transaction([this.object_model.store_name], 'readwrite').objectStore(this.object_model.store_name)
            let request
            if (this.order_by != null && this.order_by != undefined) {
                for (let key in this.order_by) {
                    let order = 'next'
                    if (this.order_by[key] == 'prev' || this.order_by[key] == -1) {
                        order = 'prev'
                    }
                    request = objectStore.openCursor(IDBKeyRange.upperBound(key, true), order)
                    break
                }
            } else {
                request = objectStore.openCursor()
            }
            let data: any = []
            request.onsuccess = (event) => {
                let t = event.target as IDBRequest
                let cursor = t.result
                if (cursor) {
                    let push_flag = true
                    push_flag = this.__where_and_exclude(cursor, this.whereOptions)
                    if (push_flag && this.excludeOptions != null && this.excludeOptions != undefined && Object.keys(this.excludeOptions).length > 0) {
                        push_flag = !this.__where_and_exclude(cursor, this.excludeOptions)
                    }
                    if (push_flag) {
                        if (this.skip_count > 0) {
                            this.skip_count--
                        } else {
                            switch (ret_type) {
                                case 'data':
                                    if (only_one) {
                                        resolve(cursor.value)
                                        return
                                    }
                                    data.push(this.__filter(cursor.value))
                                    break
                                case 'object':
                                    let obj = new this.object_model.constructor()
                                    for (let data_key in cursor.value) {
                                        obj[data_key] = cursor.value[data_key]
                                    }
                                    if (only_one) {
                                        resolve(obj)
                                        return
                                    }
                                    data.push(obj)
                                    break
                                case 'key':
                                    if (only_one) {
                                        resolve(cursor.value[this.key_path_field])
                                        return
                                    }
                                    data.push(cursor.value[this.key_path_field])
                                    break
                                default:
                                    if (only_one) {
                                        resolve(cursor.value)
                                        return
                                    }
                                    data.push(cursor.value)
                                    break
                            }
                        }
                    }
                    if (this.limit_count >= 0 && data.length >= this.limit_count) {
                        resolve(data)
                        return
                    } else {
                        cursor.continue()
                    }
                } else {
                    resolve(data)
                    return
                }
            }

            request.onerror = (event) => {
                reject(event)
            }
        })
    }

    async all() {
        return this.__get('data')
    }

    async get() {
        return this.__get('data', true)
    }

    async objs() {
        return this.__get('object')
    }
    objects = this.objs

    async obj() {
        return this.__get('object', true)
    }
    object = this.obj

    async delete() {
        return new Promise(async (resolve, reject) => {
            if (this.object_model.db === null || this.object_model.db === undefined) {
                this.object_model.db = await this.object_model.__open() as IDBDatabase
            }
            let objectStore = this.object_model.db.transaction([this.object_model.store_name], 'readwrite').objectStore(this.object_model.store_name)
            let request
            if (this.order_by != null && this.order_by != undefined) {
                for (let key in this.order_by) {
                    let order = 'next'
                    if (this.order_by[key] == 'prev' || this.order_by[key] == -1) {
                        order = 'prev'
                    }
                    request = objectStore.openCursor(IDBKeyRange.upperBound(key, true), order)
                    break
                }
            } else {
                request = objectStore.openCursor()
            }
            request.onsuccess = (event) => {
                let t = event.target as IDBRequest
                let cursor = t.result
                if (cursor) {
                    let push_flag = true
                    push_flag = this.__where_and_exclude(cursor, this.whereOptions)
                    if (push_flag && this.excludeOptions != null && this.excludeOptions != undefined && Object.keys(this.excludeOptions).length > 0) {
                        push_flag = !this.__where_and_exclude(cursor, this.excludeOptions)
                    }
                    if (push_flag) {
                        if (this.skip_count > 0) {
                            this.skip_count--
                        } else {
                            resolve(cursor.value)
                            cursor.delete()
                            return
                        }
                    }
                    cursor.continue()
                } else {
                    reject('Con not open the cursor')
                }
            }

            request.onerror = (event) => {
                reject(event)
            }
        })
    }
}
