import Vue from 'vue'
import App from './App.vue'

import VueResource from 'vue-resource'

import VJstree from 'vue-jstree'

import VueFormWizard from 'vue-form-wizard'
import 'vue-form-wizard/dist/vue-form-wizard.min.css'


Vue.use(VueFormWizard)
Vue.use(VueResource)
Vue.use(VJstree)


new Vue({
  el: '#app',
  render: h => h(App)
})


