import {FacebookEventType, TiktokEventType} from '@kingo1/universe-assignment-shared';

type Event = FacebookEventType | TiktokEventType
export const REVENUE_EVENTS: Event[] = ['purchase', 'checkout.complete']