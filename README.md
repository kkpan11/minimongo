# Minimongo

A client-side in-memory MongoDB clone with multiple storage backends and hybrid remote/local synchronization.

Uses code from Meteor.js minimongo package, reworked to support more geospatial queries and made npm friendly. It was forked in January 2014.

It is either IndexedDb backed (IndexedDb), WebSQL backed (WebSQLDb), Local storage backed (LocalStorageDb) or in memory only (MemoryDb).

Autoselection is possible with `utils.autoselectLocalDb(options, success, error)`. success is called with the selected database.

[sqlite plugin](https://github.com/xpbrew/cordova-sqlite-storage) is also supported when available, activate sqlite plugin with option {storage: 'sqlite'} in utils.autoselectLocalDb

## Features

- **MongoDB-like API** with familiar CRUD operations and query syntax
- **Multiple Storage Engines**:
  - Memory (default)
  - LocalStorage (persistent browser storage)
  - IndexedDB (asynchronous browser storage)
  - WebSQL (legacy SQL-based storage)
- **Hybrid Database** that combines local and remote data sources
- **Replication** between database instances
- **Extended JSON (EJSON)** support with custom types
- **Geospatial Queries** ($near, $geoIntersects)
- **Partial MongoDB Query Features**:
  - Logical operators: $and, $or, $nor
  - Comparison operators: $lt, $lte, $gt, $gte
  - Element operators: $exists, $type
  - Array operators: $in, $nin, $all, $elemMatch
  - Regex support
  - Sorting and limiting

## Installation
```bash
npm install minimongo
```

## Core Components

### Local Databases
```javascript
import { MemoryDb, IndexedDb } from 'minimongo';

const memoryDb = new MemoryDb();
const indexedDb = new IndexedDb({namespace: 'mydb'}, successCallback, errorCallback);
```

**Supported Operations:**
- `find(selector, options)`
- `findOne(selector, options)`
- `upsert(docs, bases, success, error)`
- `remove(id, success, error)`
- `cache(docs, selector, options, success, error)`
- `pendingUpserts()` / `pendingRemoves()`

### Hybrid Database
Combines local database with remote source:
```javascript
import { HybridDb } from 'minimongo';

const hybridDb = new HybridDb(localDb, remoteDb);
hybridDb.addCollection('items');
```

**Key Features:**
- Queries local database first
- Automatically syncs with remote source
- Handles pending upserts/removes
- Batched uploads of changes
- Conflict resolution using base documents

### Remote Database
```javascript
import { RemoteDb } from 'minimongo';

const remoteDb = new RemoteDb('/api/collections', 'mydb', {
  httpClient: jQueryHttpClient,
  useQuickFind: true
});
```

**Supported Protocols:**
- Regular REST operations
- Quickfind protocol for efficient data syncing
- Custom HTTP client support

### Replicating Database
```javascript
import { ReplicatingDb } from 'minimongo';

const replicatingDb = new ReplicatingDb(masterDb, replicaDb);
```

**Features:**
- All operations applied to both databases
- Atomic transaction support
- Cache synchronization

## Query Language
Supports MongoDB-style selectors with some limitations:

```javascript
collection.find({
  name: { $regex: /^A/ },
  age: { $gt: 18 },
  location: {
    $near: {
      $geometry: { type: "Point", coordinates: [-73.9667, 40.78] },
      $maxDistance: 1000
    }
  }
}, {
  sort: { age: -1 },
  limit: 10
}).fetch();
```

## Data Synchronization

### Hybrid Sync Process
1. Check local pending changes
2. Query local database
3. Simultaneously query remote database
4. Merge results (local data + remote updates)
5. Cache remote results locally
6. Return combined results

### Conflict Resolution
Uses base document versioning:
```javascript
collection.upsert(
  { _id: '1', name: 'updated' },
  { _id: '1', name: 'original' }, // base document
  successCallback
);
```

## Geospatial Support
- $near queries for proximity searches
- $geoIntersects for polygon intersections
- Turf.js integration for spatial operations

## Extended JSON (EJSON)
Custom type handling for:
- Dates
- Binary data (Uint8Array)
- Custom objects with clone/equals/toJSONValue methods

## Performance Features
- Query compilation to JavaScript functions
- IndexedDB bulk operations
- LocalStorage batch updates
- Quickfind protocol for efficient diffs

## Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- IE11 with polyfills
- Mobile browsers (iOS Safari, Chrome for Android)

## Limitations
- No aggregation pipeline
- Limited $where clause support
- Partial update operator support
- No transactions across collections

## Contribution
```bash
git clone https://github.com/mWater/minimongo.git
cd minimongo
npm install
npm test
```

## License
MIT License - Based on Meteor's minimongo implementation

## Usage

```javascript
// Require minimongo
var minimongo = require("minimongo");

var LocalDb = minimongo.MemoryDb;

// Create local db (in memory database with no backing)
db = new LocalDb();

// Add a collection to the database
db.addCollection("animals");

doc = { species: "dog", name: "Bingo" };

// Always use upsert for both inserts and modifies
db.animals.upsert(doc, function() {
	// Success:

	// Query dog (with no query options beyond a selector)
	db.animals.findOne({ species:"dog" }, {}, function(res) {
		console.log("Dog's name is: " + res.name);
	});
});

// Access collections via collection for Typescript
await db.collection["animals"].upsert(doc)
```

### Upserting

`db.collection["sometable"].upsert(docs, bases, success, error)` can take either a single document or multiple documents (array) for the first and second parameter.

docs is the document(s) to upsert. If bases is present, it is the base version on which the update is based. It can be omitted to use the current cached value
as the base, or put as `null` to force an overwrite (a true upsert, not a patch)

Promise interface is also available:

`await db.collection["sometable"].upsert(docs, bases)` can take either a single document or multiple documents (array) for the first and second parameter.

### Removing

`db.collection["sometable"].remove(docId, success, error)` to remove a document.

Promise interface is also available:

`db.collection["sometable"].remove(docId)`

### Finding

`db.collection["sometable"].find(selector, options).fetch(success, error)`

selector is a standard MongoDB selector, e.g. `{ x: 5, y: { $in: ['a', 'b'] } }`

options are MongoDB find options: e.g. `{ limit: 10 }`, `{ sort: ["x"] }`

Promise interface is also available: 

`await db.collection["sometable"].find(selector, options).fetch()`

### Caching

A set of rows can be cached in a local database. Call

`db.collection["sometable"].cache(docs, selector, options, success, error)`

selector and options are the selector and options that were used to perform the find that produced docs. The local database will add/remove/update its local copy appropriately.

### Seeding

A set of rows can be seeded in a local database. Seeding does not overwrite an existing row; it only makes sure that a row with that _id exists.

`db.collection["sometable"].seed(docs, success, error)`

### Un-caching

Cached rows matching a selector can be removed with:

`db.collection["sometable"].uncache(selector, success, error)`

It will not affect upserted rows.

### Resolving upserts

Upserts are stored in local databases in a special state to record that they are upserts, not cached rows. The base document on which the upsert is based is also stored. For example, if a row starts in cached state with `{ x:1 }` and is upserted to `{ x: 2 }`, both the upserted and the original state are stored. This allows the server to do 3-way merging and apply only the changes.

To resolve the upsert (for example once sent to central db), use resolveUpserts on collection

`db.collection["sometable"].resolveUpserts(upserts, success, error)` takes the list of upserts to resolve

`resolveUpserts` does not resolve an upsert if another upsert on the same row has taken place. Instead, the base value is updated (since the change has been accepted by the server) but the new upserted value is left alone.

### Resolving removes

Removed rows are still stored locally until they are resolved. This is so they can be later sent to the server.

To resolve all removes, first get a list of all ids to be removed, then resolve them one by one:

```javascript
const idsToRemove = await new Promise((resolve, reject) => collection.pendingRemoves(resolve, reject))

for (const id of idsToRemove) {
	await new Promise((resolve, reject) => collection.resolveRemove(id, resolve, reject))
}
```

### ReplicatingDb

Keeps two local databases in sync. Finds go only to master.

### IndexedDb

To make a database backed by IndexedDb:

```javascript
// Require minimongo
var minimongo = require("minimongo");

var IndexedDb = minimongo.IndexedDb;

// Create IndexedDb
db = new IndexedDb({namespace: "mydb"}, function() {
	// Add a collection to the database
	db.addCollection("animals", function() {
		doc = { species: "dog", name: "Bingo" };

		// Always use upsert for both inserts and modifies
		db.animals.upsert(doc, function() {
			// Success:

			// Query dog (with no query options beyond a selector)
			db.animals.findOne({ species:"dog" }, {}, function(res) {
				console.log("Dog's name is: " + res.name);
			});
		});
	});
}, function() { alert("some error!"); });
```

### Caching

Rows can be cached without creating a pending upsert. This is done automatically when HybridDb uploads to a remote database with the returned upserted rows. It is also done when a query is performed on HybridDb: the results are cached in the local db and the query is re-performed on the local database.

The field `_rev`, if present is used to prevent overwriting with older versions. This is the odd scenario where an updated version of a row is present, but an older query to the server is delayed in returning. To prevent this race condition from giving stale data, the _rev field is used.

### HybridDb

Combines results from the local database with remote data. Multiple options can be specified at the collection level and then overridden at the find/findOne level:

**interim**: (default true) true to return interim results from the local database before the (slower) remote database has returned. If the remote database gives different results, the callback will be called a second time. This approach allows fast responses but with subsequent correction if the server has differing information.

**cacheFind**: (default true) true to cache the `find` results from the remote database in the local database

**cacheFindOne**: (default true) true to cache the `findOne` results from the remote database in the local database

**shortcut**: (default false) true to return `findOne` results if any matching result is found in the local database. Useful for documents that change rarely.

**useLocalOnRemoteError**: (default true) true to use local results if the remote find fails. Only applies if interim is false.

To keep a local database and a remote database in sync, create a HybridDb:

```javascript
hybridDb = new HybridDb(localDb, remoteDb)
```

Be sure to add the same collections to all three databases (local, hybrid, and remote).

Then query the hybridDb (`find` and `findOne`) to have it get results and correctly combine them with any pending local results. If you are not interested in caching results, add `{ cacheFind: false, cacheFindOne: false }` to the options of `find` or `findOne` or to the `addCollection` options.

When upserts and removes are done on the HybridDb, they are queued up in the LocalDb until `hybridDb.upload(success, error)` is called.

`upload` will go through each collection and send any upserts or removes to the remoteDb. You must call this to have the results go to the server! Calling periodically (e.g., every 5 seconds) is safe as long as you wait for one upload call to complete before calling again.

`findOne` will not return an interim `null` result, but will only return interim results when one is present.

### RemoteDb

Uses AJAX-JSON calls to an API to query a real Mongo database. API is simple and contains only query, upsert, patch, and remove commands.

If the `client` field is passed to the constructor, it is appended as a query parameter (e.g., `?client=1234`) to each request made.

Example code:

```javascript
remoteDb = new minimongo.RemoteDb("http://someserver.com/api/", "myclientid123")
```

This would create a remote db that would make the following call to the API for a find to collection abc:

`GET http://someserver.com/api/abc?client=myclientid123`

The client is optional and is a string that is passed in each call only to make authentication easier.

The API that RemoteDb should support four HTTP methods for each collection:

#### GET `/<collection>`

Performs a query, returning an array of results. GET query parameters are:

- **selector** (optional): JSON of query, in MongoDB format. e.g., `{"a": 1}` to find records with field `a` having value `1`
- **fields** (optional): JSON object indicating which fields to return in MongoDB format. e.g., `{"a": 1}` to return only field `a` and `_id`
- **sort** (optional): JSON of MongoDB sort field. e.g., `["a"]` to sort ascending by `a`, or `[["a","desc"]]` to sort descending by `a`
- **limit** (optional): Maximum records to return e.g., `100`

Possible HTTP response codes:

- **200**: normal response
- **401**: client was invalid

#### POST `/<collection>/find` (optionally implemented)

Performs a query, returning an array of results. POST body parameters are:

- **selector** (optional): JSON of query, in MongoDB format. e.g., `{"a": 1}` to find records with field `a` having value `1`
- **fields** (optional): JSON object indicating which fields to return in MongoDB format. e.g., `{"a": 1}` to return only field `a` and `_id`
- **sort** (optional): JSON of MongoDB sort field. e.g., `["a"]` to sort ascending by `a`, or `[["a","desc"]]` to sort descending by `a`
- **limit** (optional): Maximum records to return e.g., `100`

Possible HTTP response codes:

- **200**: normal response
- **401**: client was invalid

#### POST `/<collection>`

Performs a single upsert, returning the upserted row. POST value is the document to upsert. Possible HTTP response codes:

- **200**: document was upserted. Returns the upserted object (see notes below on merging)
- **400**: document did not pass validation
- **401**: client was invalid or not present
- **403**: permission denied to upsert
- **409**: another client was upserting the same document. Try again.
- **410**: document was already removed and cannot be upserted

On `403` or `410`, the change is automatically discarded in the HybridDb.

If an array is POSTed, upsert each one and return an array of upserted documents.

#### PATCH `/<collection>`

Performs a patch, returning the upserted row. PATCH value is the following structure:

```javascript
{
	doc: <the document in its new form. Can also be an array of documents>,
	base: <base document on which the changes were made. Can also be an array of base documents, which match the length of the doc array>
}
```

For example, to change `{ x:1, y:1 }` to set x to be 2, PATCH would send:

```javascript
{
	doc: { x:2, y: 1 },
	base: { x:1, y: 1 }
}
```

Possible HTTP response codes:

- **200**: document was upserted. Returns the upserted object
- **400**: document did not pass validation
- **401**: client was invalid or not present
- **403**: permission denied to upsert
- **409**: another client was upserting the same document. Try again.
- **410**: document was already removed and cannot be upserted

On `403` or `410`, the change is automatically discarded in the HybridDb.

#### DELETE `/<collection>/<_id>`

Note: the RemoteDb does not support remove({ filter }), but only removing a single document by _id!!

Removes to the local collection are converted into a series of _ids to be removed when sent to the server.

Removes a document. _id of the document to remove

- **200**: document was removed
- **401**: client was invalid or not present
- **403**: permission denied to remove
- **410**: document was already removed and cannot be removed again

On `403` or `410`, the change is automatically discarded in the HybridDb.

### Merging

Minimongo is designed to work with a server that performs three-way merging of documents that are being upserted by multiple users.

It can also be used with a simple server that just overwrites documents completely on upsert, just taking the doc value of PATCH, though this is not recommended.

## Testing

To test, run `testem` in the main directory.

To test a RemoteDb implementation, use `test/LiveRemoteDbTests.ts`. The server must have a collection called scratch with fields as specified at the top of the tests file.

### Quickfind

Finds can be very wasteful when the client has large collections already cached. The quickfind protocol shards the existing docs on the client by
id and then sends a hash of them to the server, which just responds with the changed ones. See src/quickfind.ts for more details. It needs to be
enabled and is off by default.