import { z } from 'zod'

const funnelStageSchema = z.union([z.literal('top'), z.literal('bottom')])

const facebookTopEventTypeSchema = z.union([
  z.literal('ad.view'),
  z.literal('page.like'),
  z.literal('comment'),
  z.literal('video.view'),
])

const facebookBottomEventTypeSchema = z.union([
  z.literal('ad.click'),
  z.literal('form.submission'),
  z.literal('checkout.complete'),
])

const facebookEventTypeSchema = z.union([
  facebookTopEventTypeSchema,
  facebookBottomEventTypeSchema,
])

const facebookUserSchema = z.object({
  userId: z.string(),
  name: z.string(),
  age: z.number(),
  gender: z.union([
    z.literal('male'),
    z.literal('female'),
    z.literal('non-binary'),
  ]),
  location: z.object({
    country: z.string(),
    city: z.string(),
  }),
})

const facebookEngagementTopSchema = z.object({
  actionTime: z.string(),
  referrer: z.union([
    z.literal('newsfeed'),
    z.literal('marketplace'),
    z.literal('groups'),
  ]),
  videoId: z.string().nullable(),
})

const facebookEngagementBottomSchema = z.object({
  adId: z.string(),
  campaignId: z.string(),
  clickPosition: z.union([
    z.literal('top_left'),
    z.literal('bottom_right'),
    z.literal('center'),
  ]),
  device: z.union([z.literal('mobile'), z.literal('desktop')]),
  browser: z.union([
    z.literal('Chrome'),
    z.literal('Firefox'),
    z.literal('Safari'),
  ]),
  purchaseAmount: z.string().nullable(),
})

const facebookEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string().refine(val => {
    const date = new Date(val)
    return !isNaN(date.getTime())
  }),
  source: z.literal('facebook'),
  funnelStage: funnelStageSchema,
  eventType: facebookEventTypeSchema,
  data: z.object({
    user: facebookUserSchema,
    engagement: z.union([
      facebookEngagementTopSchema,
      facebookEngagementBottomSchema,
    ]),
  }),
})

const tiktokTopEventTypeSchema = z.union([
  z.literal('video.view'),
  z.literal('like'),
  z.literal('share'),
  z.literal('comment'),
])

const tiktokBottomEventTypeSchema = z.union([
  z.literal('profile.visit'),
  z.literal('purchase'),
  z.literal('follow'),
])

const tiktokEventTypeSchema = z.union([
  tiktokTopEventTypeSchema,
  tiktokBottomEventTypeSchema,
])

const tiktokUserSchema = z.object({
  userId: z.string(),
  username: z.string(),
  followers: z.number(),
})

const tiktokEngagementTopSchema = z.object({
  watchTime: z.number(),
  percentageWatched: z.number(),
  device: z.union([
    z.literal('Android'),
    z.literal('iOS'),
    z.literal('Desktop'),
  ]),
  country: z.string(),
  videoId: z.string(),
})

const tiktokEngagementBottomSchema = z.object({
  actionTime: z.string(),
  profileId: z.string().nullable(),
  purchasedItem: z.string().nullable(),
  purchaseAmount: z.string().nullable(),
})

const tiktokEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string().refine(val => {
    const date = new Date(val)
    return !isNaN(date.getTime())
  }),
  source: z.literal('tiktok'),
  funnelStage: funnelStageSchema,
  eventType: tiktokEventTypeSchema,
  data: z.object({
    user: tiktokUserSchema,
    engagement: z.union([
      tiktokEngagementTopSchema,
      tiktokEngagementBottomSchema,
    ]),
  }),
})

export const eventSchema = z.union([facebookEventSchema, tiktokEventSchema])

export type ValidEvent = z.infer<typeof eventSchema>
