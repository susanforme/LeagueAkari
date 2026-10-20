import { CHAMPION_POOL_ROUTE } from '@shared/pro/champion-pool'
import { NOTEBOOK_ROUTE } from '@shared/pro/notebook'
import { PROFILE_ROUTE } from '@shared/pro/profile'
import { PROGRESS_ROUTE } from '@shared/pro/progress'
import { REVIEW_ROUTE } from '@shared/pro/review'
import {
  BookOpen24Regular,
  DocumentSearch24Regular,
  PeopleTeam24Regular,
  Person24Regular,
  TargetArrow24Regular
} from '@vicons/fluent'
import type { TFunction } from 'i18next'
import { NIcon } from 'naive-ui'
import { h } from 'vue'

export function proNavigation(t: TFunction) {
  return [
    {
      key: PROFILE_ROUTE,
      icon: () => h(NIcon, null, { default: () => h(Person24Regular) }),
      name: t('pro.profile.title')
    },
    {
      key: CHAMPION_POOL_ROUTE,
      icon: () => h(NIcon, null, { default: () => h(PeopleTeam24Regular) }),
      name: t('pro.championPool.title')
    },
    {
      key: NOTEBOOK_ROUTE,
      icon: () => h(NIcon, null, { default: () => h(BookOpen24Regular) }),
      name: t('pro.notebook.title')
    },
    {
      key: REVIEW_ROUTE,
      icon: () => h(NIcon, null, { default: () => h(DocumentSearch24Regular) }),
      name: t('pro.review.title')
    },
    {
      key: PROGRESS_ROUTE,
      icon: () => h(NIcon, null, { default: () => h(TargetArrow24Regular) }),
      name: t('pro.workshop.title')
    }
  ]
}
