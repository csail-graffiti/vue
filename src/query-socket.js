import { clientFormat } from './object-formatting.js'

export default class QuerySocket {

  constructor(origin, auth) {
    this.origin = origin
    this.auth = auth

    this.socketID = null
    this.queries = {}
    this.updateCallbacks = {}
    this.deleteCallbacks = {}

    // Close silently
    this.isUnloading = false
    window.addEventListener(
      "beforeunload",
      (e => {this.isUnloading=true}).bind(this));

    // Connect
    const wsURL = new URL('query_socket', this.origin)
    if (wsURL.protocol == 'https:') {
      wsURL.protocol = 'wss:'
    } else {
      wsURL.protocol = 'ws:'
    }
    this.ws = new WebSocket(wsURL)
    this.ws.onmessage = this.onSocketMessage.bind(this)
    this.ws.onclose   = this.onSocketClose  .bind(this)
    this.ws.onerror   = this.onSocketError  .bind(this)
  }

  async now() {
    // Wait for first ping
    while (!this.serverPingTime || !this.localPingTime) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return Date.now() - this.localPingTime + this.serverPingTime
  }

  getQuery(queryID) {
    return this.queries[queryID]
  }

  async updateQuery(queryID, query, updateCallback, deleteCallback) {
    // Add the query internally
    this.queries[queryID] = query
    this.updateCallbacks[queryID] = x => updateCallback(clientFormat(x))
    this.deleteCallbacks[queryID] = deleteCallback

    return await this.auth.request(
      'post', 'update_socket_query', {
        socket_id: this.socketID,
        query_id: queryID,
        query: query
      }
    )
  }

  async deleteQuery(queryID) {
    delete this.queries[queryID]
    delete this.updateCallbacks[queryID]
    delete this.deleteCallbacks[queryID]

    return await this.auth.request(
      'post', 'delete_socket_query', {
        socket_id: this.socketID,
        query_id: queryID,
      }
    )
  }

  onSocketMessage(event) {

    const data = JSON.parse(event.data)

    if (data.type == 'Ping') {
      // Sync with the server time
      this.serverPingTime = data.timestamp
      this.localPingTime = Date.now()
      // Store the socket ID
      if (!this.socketID) {
        this.socketID = data.socket_id
        console.log(`graffiti query socket is open with id '${this.socketID}'`)
      }
    } else if (data.type == 'Update') {
      // Call the update callback
      this.updateCallbacks[data.query_id](data)
    } else if (data.type == 'Delete') {
      // Call the delete callback
      this.deleteCallbacks[data.query_id](data.object_id)
    } else if (data.type == 'Reject') {
      throw {
        type: data.type,
        content: 'A query was rejected. ' + data.content,
        queryID: data.query_id,
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
    if (!this.isUnloading) {
      const shouldReload = confirm("lost connection to the graffiti server.\n\nonce you've established an internet connection, select \"OK\" to reload or select \"Cancel\" to remain on the page and save any data.")
      if (shouldReload) {
        window.location.reload()
      }
    }
  }

  async onSocketError(error) {
    this.ws.close()
  }
}
