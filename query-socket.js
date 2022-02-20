export default class QuerySocket {

  constructor(origin, auth) {
    // Initialize
    this.origin = origin
    this.auth = auth
    this.socket_id_const = null
    this.queries = {}
    this.callbacks = {}
    this.dropped_queries = {}
    this.dropped_callbacks = {}

    // Open up a WebSocket with the server
    this.connect()
  }

  async connect() {
    const token = await this.auth.token
    const wsURL = new URL('query_socket', this.origin)
    if (wsURL.protocol == 'https:') {
      wsURL.protocol = 'wss:'
    } else {
      wsURL.protocol = 'ws:'
    }
    wsURL.searchParams.set('token', token)
    this.ws = new WebSocket(wsURL)
    this.ws.onmessage = this.onSocketMessage.bind(this)
    this.ws.onclose   = this.onSocketClose  .bind(this)
    this.ws.onerror   = this.onSocketError  .bind(this)
  }

  get socket_id() {
    return (async () => {
      // If the socket ID doesn't already exist, wait for it
      while (!this.socket_id_const) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      return this.socket_id_const
    })()
  }

  async addQuery(query_id, query, callback) {
    // Add the query internally
    this.queries[query_id] = query
    this.callbacks[query_id] = callback

    return await this.auth.request(
      'post', 'query_socket_add', {
        socket_id: await this.socket_id,
        query_id: query_id,
        query: query
      }
    )
  }

  async removeQuery(query_id) {
    delete this.queries[query_id]
    delete this.callbacks[query_id]

    return await this.auth.request(
      'post', 'query_socket_remove', {
        socket_id: await this.socket_id,
        query_id: query_id,
      }
    )
  }

  async onSocketMessage(event) {
    const data = JSON.parse(event.data)

    if (data.type == 'Ping') {
      // Store the socket ID
      if (!this.socket_id_const) {
        this.socket_id_const = data.socket_id
        console.log(`Query socket is open with id '${this.socket_id_const}'`)
      }
    } else if (data.type == 'Update') {
      // Call the callback
      await this.callbacks[data.query_id](
        data.object,
        data.near_misses,
        data.accept
      )
    } else if (data.type == 'Reject') {
      throw {
        type: data.type,
        content: 'A query was rejected. ' + data.content,
        query_id: data.query_id,
        query: this.queries[data.query_id],
      }
    } else {
      throw {
        type: 'Error',
        content: `Unrecognized type, '${data.type}'`,
        object: data
      }
    }
  }

  async onSocketClose(event) {
    // Forget the socket id
    this.socket_id_const = null

    // Remove all open queries
    // and add them to the "dropped queries"
    for (let query_id in this.queries) {
      this.dropped_queries[query_id] = this.queries[query_id]
      this.dropped_callbacks[query_id] = this.callbacks[query_id]
      delete this.queries[query_id]
      delete this.callbacks[query_id]
    }

    console.log('Query socket is closed. Will attempt to reconnect in 5 seconds...')
    setTimeout(this.connect.bind(this), 5000)
  }

  async onConnect(event) {
    // Add back all the queries that got dropped
    for (let query_id in this.dropped_queries) {
      await this.addQuery(
        query_id,
        this.dropped_queries[query_id],
        this.dropped_callbacks[query_id])
      delete this.dropped_queries[query_id]
      delete this.dropped_callbacks[query_id]
    }
  }

  async onSocketError(error) {
    this.ws.close();
  }
}
