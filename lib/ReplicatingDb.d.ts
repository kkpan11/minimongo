import { Doc, MinimongoDb, MinimongoLocalCollection } from "./types";
export default class ReplicatingDb implements MinimongoDb {
    collections: {
        [collectionName: string]: Collection<any>;
    };
    masterDb: MinimongoDb;
    replicaDb: MinimongoDb;
    constructor(masterDb: MinimongoDb, replicaDb: MinimongoDb);
    addCollection(name: any, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
declare class Collection<T extends Doc> implements MinimongoLocalCollection<T> {
    name: string;
    masterCol: MinimongoLocalCollection<T>;
    replicaCol: MinimongoLocalCollection<T>;
    constructor(name: string, masterCol: MinimongoLocalCollection, replicaCol: MinimongoLocalCollection);
    find(selector: any, options: any): {
        fetch(success: (docs: T[]) => void, error: (err: any) => void): void;
    };
    findOne(selector: any, options: any, success: any, error?: any): void;
    upsert(docs: any, bases: any, success: any, error?: any): void;
    remove(id: any, success: any, error: any): void;
    cache(docs: any, selector: any, options: any, success: any, error: any): void;
    pendingUpserts(success: any, error: any): void;
    pendingRemoves(success: any, error: any): void;
    resolveUpserts(upserts: any, success: any, error: any): void;
    resolveRemove(id: any, success: any, error: any): void;
    seed(docs: any, success: any, error: any): void;
    cacheOne(doc: any, success: any, error: any): void;
    cacheList(docs: any, success: any, error: any): void;
    uncache(selector: any, success: any, error: any): void;
    uncacheList(ids: any, success: any, error: any): void;
}
export {};
