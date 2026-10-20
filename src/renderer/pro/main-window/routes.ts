import { CHAMPION_POOL_ROUTE } from '@shared/pro/champion-pool'
import { NOTEBOOK_ROUTE } from '@shared/pro/notebook'
import { PROFILE_ROUTE } from '@shared/pro/profile'
import { PROGRESS_ROUTE } from '@shared/pro/progress'
import { REVIEW_ROUTE } from '@shared/pro/review'
import type { RouteRecordRaw } from 'vue-router'

export const proRoutes: RouteRecordRaw[] = [
  {
    name: PROGRESS_ROUTE,
    path: '/pro/progress',
    component: () => import('./views/progress/ProgressPage.vue')
  },
  {
    name: REVIEW_ROUTE,
    path: '/pro/review',
    component: () => import('./views/review/ReviewPage.vue')
  },
  {
    name: PROFILE_ROUTE,
    path: '/pro/profile',
    component: () => import('./views/profile/ProfilePage.vue')
  },
  {
    name: CHAMPION_POOL_ROUTE,
    path: '/pro/champion-pool',
    component: () => import('./views/champion-pool/ChampionPoolPage.vue')
  },
  {
    name: NOTEBOOK_ROUTE,
    path: '/pro/notebook',
    component: () => import('./views/notebook/NotebookPage.vue')
  }
]
