import Vue from 'vue'
import App from './App.vue'

import VueResource from 'vue-resource'

import VJstree from 'vue-jstree'

//import VTreeselect from 'vue-treeselect'

// import ZTree from 'vue2-lazy-tree'
// import './../dist/vue2-tree.min.css'

import VueFormWizard from 'vue-form-wizard'
import 'vue-form-wizard/dist/vue-form-wizard.min.css'


Vue.use(VueFormWizard)
Vue.use(VueResource)
Vue.use(VJstree)
//Vue.use(ZTree)
//Vue.use(VTreeselect)

new Vue({
  el: '#app',
  render: h => h(App)
})


