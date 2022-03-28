import GraffitiTools from './vanilla.js'

export default function GraffitiCollection(vue, graffitiURL='https://graffiti.csail.mit.edu') {
  const graffiti = new GraffitiTools(graffitiURL)

  return {

    props: {

      // The base form that all objects should fit
      base: {
        type: Object,
        default: function() {
          return {}
        }
      },

      // The additional filter that all
      // objects should adhere to
      filter: {
        type: Object,
        default: function() {
          return {}
        }
      },

      // How many objects should be
      // pre-loaded from the start
      rewindInit: {
        type: Number,
        default: 0,
      },

      // The way that objects are sorted
      sort: {
        type: Function,
        default: function(a, b) {
          return a.timestamp - b.timestamp
        },
      },

      // Will the objects be synchronized
      // live or only updated in response
      // to manual edits or fetches
      live: {
        type: Boolean,
        default: false
      },
    },

    data: function() {
      return {
        canRewind: true,
      }
    },

    computed: {
      // Objects sorted by the sort function
      objects() {
        return Object.values(this.objectMap).sort(this.sort)
      },

      // The actual query sent to the server
      query() {
        return {
          "$and": [
            this.base,
            this.filter,
            { timestamp: { "$type": "long" } }
          ]
        }
      },
    },

    setup(props) {
      // Create an object full of results
      const objectMap = vue.reactive({})

      // Begin subscribing to an object
      const querySubscriber = graffiti.QuerySubscriber(objectMap, props.live)
      // Make sure it will disconnect appropriately
      vue.onBeforeUnmount(querySubscriber.delete)

      return { objectMap, querySubscriber }
    },

    watch: {
      query: {
        handler: async function(newQuery) {
          // Update the query and rewind
          await this.querySubscriber.update(newQuery)
          this.canRewind = await this.rewind(this.rewindInit)
        },
        deep: true,
        immediate: true
      },
    },

    methods: {
      async rewind(limit) {
        await this.querySubscriber.rewind(limit)
      },

      async play(limit) {
        await this.querySubscriber.play(limit)
      },

      async update(object) {
        console.log("i'm updating!")
        // Apply the object to the base
        const basedObject = Object.assign({}, this.base)
        Object.assign(basedObject, object)
        console.log(basedObject)

        // Send it to the server
        const id = await graffiti.update(basedObject)

        // Then make sure it is returned in the query
        const output = await graffiti.queryOne({ "$and": [
          this.query,
          { id: id }
        ]})

        if (!output) {
          await graffiti.delete(id)
          throw {
            type: 'Error',
            content: 'Tried to update an object, but it would not be included in this collection\'s query.',
            object: object,
            query: this.query
          }
        } else {
          this.objectMap[id] = output
        }
      },

      async delete_(id) {
        if (!(id in objectMap)) {
          throw {
            type: 'Error',
            content: 'An ID was supposed to be deleted, but it is not in this collection',
            id: id
          }
        }
        await graffiti.delete(id)
        delete objectMap[id]
      },
    },

    // Fill the inside with whatever
    template: `
    <slot
      :objects       = "objects"
      :canRewind     = "canRewind"
      :update        = "update"
      :delete        = "delete_"
      :play          = "play"
      :rewind        = "rewind"
    ></slot>`
  }
}
