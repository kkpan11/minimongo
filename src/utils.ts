// Utilities for db handling
import _ from "lodash"

import { compileDocumentSelector, compileSort } from "./selector"
import { default as booleanPointInPolygon } from "@turf/boolean-point-in-polygon"
import { default as intersect } from "@turf/intersect"
import { default as booleanCrosses } from "@turf/boolean-crosses"
import { default as booleanWithin } from "@turf/boolean-within"
import { MinimongoDb, MinimongoLocalCollection, MinimongoLocalDb } from "./types"

import { default as IndexedDb } from "./IndexedDb"
import { default as WebSQLDb } from "./WebSQLDb"
import { default as LocalStorageDb } from "./LocalStorageDb"
import { default as MemoryDb } from "./MemoryDb"
import { default as HybridDb } from "./HybridDb"
import { LineString, Point } from "@turf/helpers"
import distance from "@turf/distance"
import nearestPointOnLine from "@turf/nearest-point-on-line"

// Test window.localStorage
function isLocalStorageSupported() {
  if (!window.localStorage) {
    return false
  }
  try {
    window.localStorage.setItem("test", "test")
    window.localStorage.removeItem("test")
    return true
  } catch (e) {
    return false
  }
}

// Compile a document selector (query) to a lambda function
export { compileDocumentSelector }

// Select appropriate local database, prefering IndexedDb, then WebSQLDb, then LocalStorageDb, then MemoryDb
export function autoselectLocalDb(options: any, success: any, error: any) {
  // Browsers with no localStorage support don't deserve anything better than a MemoryDb
  if (!isLocalStorageSupported()) {
    return new MemoryDb(options, success)
  }

  // Always use WebSQL plugin in cordova iOS only
  if ((window as any)["cordova"]) {
    if ((window as any)["device"]?.platform === "iOS" && (window as any)["sqlitePlugin"]) {
      console.log("Selecting WebSQLDb(sqlite) for Cordova")
      options.storage = "sqlite"
      return new WebSQLDb(options, success, error)
    }
  }

  // Always use IndexedDb in browser if supported
  if (window.indexedDB) {
    console.log("Selecting IndexedDb for browser")
    return new IndexedDb(options, success, (err: any) => {
      console.log("Failed to create IndexedDb: " + (err ? err.message : undefined))
      // Create LocalStorageDb instead
      return new LocalStorageDb(options, success, (err: any) => {
        console.log("Failed to create LocalStorageDb: " + (err ? err.message : undefined))
        // Create MemoryDb instead
        return new MemoryDb(options, success)
      })
    })
  }

  // Use Local Storage otherwise
  console.log("Selecting LocalStorageDb for fallback")
  return new LocalStorageDb(options, success, error)
}

// Migrates a local database's pending upserts and removes from one database to another
// Useful for upgrading from one type of database to another
export function migrateLocalDb(fromDb: any, toDb: any, success: any, error: any) {
  // Migrate collection using a HybridDb
  const hybridDb = new HybridDb(fromDb, toDb)
  for (let name in fromDb.collections) {
    const col = fromDb.collections[name]
    if (toDb[name]) {
      hybridDb.addCollection(name)
    }
  }

  return hybridDb.upload(success, error)
}

/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
export function cloneLocalDb(
  fromDb: MinimongoLocalDb,
  toDb: MinimongoLocalDb
): Promise<void>
export function cloneLocalDb(
  fromDb: MinimongoLocalDb,
  toDb: MinimongoLocalDb,
  success: () => void,
  error: (err: any) => void
): void
export function cloneLocalDb(
  fromDb: MinimongoLocalDb,
  toDb: MinimongoLocalDb,
  success?: () => void,
  error?: (err: any) => void
): Promise<void> | void {
  if (!success && !error) {
    return new Promise<void>((resolve, reject) => {
      cloneLocalDb(fromDb, toDb, resolve, reject)
    })
  }

  async function clone() {
    // Create collections in toDb for all collections in fromDb
    for (const name in fromDb.collections) {
      if (!toDb.collections[name]) {
        await new Promise<void>((resolve, reject) => {
           toDb.addCollection(name, resolve, reject)
        })
      }
    }

    // Clone each collection in parallel
    await Promise.all(Object.values(fromDb.collections).map((fromCol) => {
      return cloneLocalCollection(fromCol, toDb.collections[fromCol.name])
    }))
  }

  clone().then(success).catch(error)
}

/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
export function cloneLocalCollection(
  fromCol: MinimongoLocalCollection,
  toCol: MinimongoLocalCollection
): Promise<void>
export function cloneLocalCollection(
  fromCol: MinimongoLocalCollection,
  toCol: MinimongoLocalCollection,
  success: () => void,
  error: (err: any) => void
): void
export function cloneLocalCollection(
  fromCol: MinimongoLocalCollection,
  toCol: MinimongoLocalCollection,
  success?: () => void,
  error?: (err: any) => void
): Promise<void> | void {
  if (!success && !error) {
    return new Promise<void>((resolve, reject) => {
      cloneLocalCollection(fromCol, toCol, resolve, reject)
    })
  }

  async function clone() {
    // Get all items
    const items = await fromCol.find({}).fetch()

    // Seed items
    await new Promise<void>((resolve, reject) => {
      toCol.seed(items, resolve, reject)
    })

    // Copy upserts
    const upserts = await new Promise<any[]>((resolve, reject) => {
      fromCol.pendingUpserts(resolve, reject)
    })
    
    // Upsert items
    await toCol.upsert(upserts.map((item) => item.doc), upserts.map((item) => item.base))

    // Copy removes
    const removes = await new Promise<string[]>((resolve, reject) => {
      fromCol.pendingRemoves(resolve, reject)
    })

    // Remove items
    for (let remove of removes) {
      await toCol.remove(remove)
    }
  }

  clone().then(success).catch(error)
}

// Processes a find with sorting and filtering and limiting
export function processFind(items: any, selector: any, options: any) {
  let filtered = _.filter(items, compileDocumentSelector(selector))

  // Handle geospatial operators
  filtered = processNearOperator(selector, filtered)
  filtered = processGeoIntersectsOperator(selector, filtered)

  if (options && options.sort) {
    filtered.sort(compileSort(options.sort))
  }

  if (options && options.skip) {
    filtered = _.slice(filtered, options.skip)
  }

  if (options && options.limit) {
    filtered = _.take(filtered, options.limit)
  }

  // Apply fields if present
  if (options && options.fields) {
    filtered = filterFields(filtered, options.fields)
  }

  return filtered
}

/** Include/exclude fields in mongo-style */
export function filterFields(items: any[], fields: any = {}): any[] {
  // Handle trivial case
  if (_.keys(fields).length === 0) {
    return items
  }

  // For each item
  return _.map(items, function (item: any) {
    let field, obj, path, pathElem
    const newItem: any = {}

    if (_.first(_.values(fields)) === 1) {
      // Include fields
      for (field of _.keys(fields).concat(["_id"])) {
        path = field.split(".")

        // Determine if path exists
        obj = item
        for (pathElem of path) {
          if (obj) {
            obj = obj[pathElem]
          }
        }

        if (obj == null) {
          continue
        }

        // Go into path, creating as necessary
        let from = item
        let to = newItem
        for (pathElem of _.initial(path)) {
          to[pathElem] = to[pathElem] || {}

          // Move inside
          to = to[pathElem]
          from = from[pathElem]
        }

        // Copy value
        to[_.last(path)!] = from[_.last(path)!]
      }

      return newItem
    } else {
      // Deep clone as we will be deleting keys from item to exclude fields
      item = JSON.parse(JSON.stringify(item))

      // Exclude fields
      for (field of _.keys(fields)) {
        path = field.split(".")

        // Go inside path
        obj = item
        for (pathElem of _.initial(path)) {
          if (obj) {
            obj = obj[pathElem]
          }
        }

        // If not there, don't exclude
        if (obj == null) {
          continue
        }

        delete obj[_.last(path)!]
      }

      return item
    }
  })
}

// Creates a unique identifier string
export function createUid() {
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function processNearOperator(selector: any, list: any) {
  for (var key in selector) {
    var value = selector[key]
    if (value != null && value["$near"]) {
      var geo = value["$near"]["$geometry"]
      if (geo.type !== "Point") {
        break
      }

      // Filter to points and lines
      list = _.filter(list, (doc: any) => doc[key] && (doc[key].type === "Point" || doc[key].type === "LineString"))

      // Get distances
      let distances = _.map(list, (doc: any) => ({
        doc,
        distance: getDistance(geo, doc[key])
      }))

      // Filter non-points
      distances = _.filter(distances, (item: any) => item.distance >= 0)

      // Sort by distance
      distances = _.sortBy(distances, "distance")

      // Filter by maxDistance
      if (value["$near"]["$maxDistance"]) {
        distances = _.filter(distances, (item: any) => item.distance <= value["$near"]["$maxDistance"])
      }

      // Extract docs
      list = _.map(distances, "doc")
    }
  }
  return list
}

function getDistance(from: Point, to: Point | LineString) {
  if (to.type === "Point") {
    return distance(from, to, { units: "meters" })
  }
  if (to.type === "LineString") {
    const nearest = nearestPointOnLine(to, from, { units: "meters" })
    return nearest.properties.dist
  }
  throw new Error("Unsupported type")
}

function pointInPolygon(point: any, polygon: any) {
  return booleanPointInPolygon(point, polygon)
}

function polygonIntersection(polygon1: any, polygon2: any) {
  return intersect(polygon1, polygon2) != null
}

// From http://www.movable-type.co.uk/scripts/latlong.html
function getDistanceFromLatLngInM(lat1: any, lng1: any, lat2: any, lng2: any) {
  const R = 6370986 // Radius of the earth in m
  const dLat = deg2rad(lat2 - lat1) // deg2rad below
  const dLng = deg2rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const d = R * c // Distance in m
  return d
}

function deg2rad(deg: any) {
  return deg * (Math.PI / 180)
}

function processGeoIntersectsOperator(selector: any, list: any) {
  for (var key in selector) {
    const value = selector[key]
    if (value != null && value["$geoIntersects"]) {
      var geo = value["$geoIntersects"]["$geometry"]
      // Can only test intersection with polygon
      if (geo.type !== "Polygon") {
        break
      }

      // Check within for each
      list = _.filter(list, function (doc: any) {
        // Ignore if null
        if (!doc[key]) {
          return false
        }

        // Check point or polygon
        if (doc[key].type === "Point") {
          return pointInPolygon(doc[key], geo)
        } else if (["Polygon", "MultiPolygon"].includes(doc[key].type)) {
          return polygonIntersection(doc[key], geo)
        } else if (doc[key].type === "LineString") {
          // Special case for empty line string (bug Dec 2023)
          if (doc[key].coordinates.length === 0) {
            return false
          }
          return booleanCrosses(doc[key], geo) || booleanWithin(doc[key], geo)
        } else if (doc[key].type === "MultiLineString") {
          // Bypass deficiencies in turf.js by splitting it up
          for (let line of doc[key].coordinates) {
            const lineGeo = { type: "LineString", coordinates: line }
            // Special case for empty line string (bug Dec 2023)
            if (lineGeo.coordinates.length === 0) {
              continue
            }
            if (booleanCrosses(lineGeo, geo) || booleanWithin(lineGeo, geo)) {
              return true
            }
          }
          return false
        }
      })
    }
  }

  return list
}

/** Tidy up upsert parameters to always be a list of { doc: <doc>, base: <base> },
 * doing basic error checking and making sure that _id is present
 * Returns [items, success, error]
 */
export function regularizeUpsert<T>(
  docs: any,
  bases: any,
  success: any,
  error: any
): [{ doc: T; base?: T }[], (docs: T[]) => void, (err: any) => void] {
  // Handle case of bases not present
  if (_.isFunction(bases)) {
    ;[bases, success, error] = [undefined, bases, success]
  }

  // Handle single upsert
  if (!_.isArray(docs)) {
    docs = [docs]
    bases = [bases]
  } else {
    bases = bases || []
  }

  // Make into list of { doc: .., base: }
  const items = _.map(docs, (doc, i) => ({
    doc,
    base: i < bases.length ? bases[i] : undefined
  }))

  // Set _id
  for (let item of items) {
    if (!item.doc._id) {
      item.doc._id = createUid()
    }
    if (item.base && !item.base._id) {
      throw new Error("Base needs _id")
    }
    if (item.base && item.base._id !== item.doc._id) {
      throw new Error("Base needs same _id")
    }
  }

  return [items, success, error]
}
