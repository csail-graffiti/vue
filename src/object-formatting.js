export function serverFormat(clientObject) {
  // Copy the object so we don't modify the original
  const objectCopy = Object.assign({}, clientObject)

  // TODO:
  // Expansion of contexts

  // Extract fields from the object
  // (they're passed in separately on the
  // server for type verification)
  delete objectCopy['~contexts']
  return {
    object: objectCopy,
    contexts: clientObject['~contexts'],
  }
}

export function clientFormat(serverObject) {
  if (!serverObject) return serverObject
  const clientObject = serverObject.object
  clientObject['~contexts'] = serverObject.contexts
  return clientObject
}
