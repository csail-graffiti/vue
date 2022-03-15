import Auth from './auth.js'
import QuerySocket from './query-socket.js'

export default class GraffitiTools {

  constructor(origin) {
    this.origin = origin
    this.auth = new Auth(this.origin)
    this.querySocket = new QuerySocket(this.origin, this.auth)
    this.rewindQueries = {}
  }

  async isInitialized() {
    await this.auth.isInitialized()
    await this.querySocket.isInitialized()
  }

  get mySignature() {
    return this.auth.mySignature
  }

  logOut() {
    this.auth.logOut()
  }

  now() {
    return this.querySocket.now()
  }

  async update(object) {
    return await this.auth.request('post', 'update', this.serverFormat(object))
  }

  async delete(objectID) {
    return await this.auth.request('post', 'delete', {
      object_id: objectID
    })
  }

  async queryMany(query, limit, sort) {
    let data = await this.auth.request('post', 'query_many', {
      query: query,
      limit: limit,
      sort: sort
    })
    return data.map(clientFormat)
  }

  async queryOne(query, sort) {
    let data = await this.auth.request('post', 'query_one', {
      query: query,
      sort: sort
    })
    return clientFormat(data)
  }

  serverFormat(object) {
    // Copy the object so we don't modify the original
    let objectCopy = Object.assign({}, object)

    // Add a timestamp if not specified
    objectCopy.timestamp = this.now()

    // Extract fields from the object
    // (they're passed in separately on the
    // server for type verification)
    delete objectCopy.nearMisses
    delete objectCopy.access
    return {
      object: objectCopy,
      near_misses: object.nearMisses,
      access: object.access
    }
  }

  subscriber(results) {
    // Generate a random query ID
    const queryID = Math.random().toString(16).substr(2, 14)

    // Supply a function that updates the query
    const updateQuery = (async function(query) {
      // Clear the results
      for (var r in results) delete results[r]

      // Update the query
      await this.querySocket.updateQuery(
        queryID,
        query,
        result => results[clientFormat(result).id] = clientFormat(result),
        resultID => delete results[resultID]
      )
    }).bind(this)

    // Add a hook to properly close the query
    const deleteQuery = (async function() {
      delete this.rewindQueries[queryID]
      this.querySocket.deleteQuery(queryID)
    }).bind(this)

    // And finally add a function that lets you rewind the query
    this.rewindQueries[queryID] = {}
    const rewindQuery = (async function(limit=100) {

      // Remember the query
      const query = this.querySocket.getQuery(queryID)

      // Fetch #(limit) preceding query matches
      const earlier = await this.queryMany(
        { "$and": [query, this.rewindQueries[queryID] ] },
        limit
      )

      // If there are any matches
      if (earlier.length) {
        // Call the update callback on each of them
        earlier.map(result => results[result.id] = result)

        // Get the earliest match
        const earliest = earlier[earlier.length-1]

        // And next time only look for things even earlier
        this.rewindQueries[queryID] = { "$or": [
          { "timestamp": { "$lt": earliest.timestamp } },
          {
            "timestamp": { "$eq": earliest.timestamp },
            "id": { "$lt": earliest.id }
          }
        ]}
      }

      // Return whether or not we have completed
      return earlier.length == limit
    }).bind(this)

    return { updateQuery, deleteQuery, rewindQuery }
  }
}

function clientFormat(data) {
  if (!data) return data
  let object = data.object
  object.nearMisses = data.near_misses
  object.access = data.access
  return object
}
