import { createRouter, createWebHistory } from 'vue-router'
import WalkersView from '../views/WalkersView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'walkers',
      component: WalkersView,
    },
  ],
})

export default router