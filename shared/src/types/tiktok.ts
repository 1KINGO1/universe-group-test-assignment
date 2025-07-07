import {FunnelStage} from './funnel-stage';

export type TiktokTopEventType = "video.view" | "like" | "share" | "comment";
export type TiktokBottomEventType = "profile.visit" | "purchase" | "follow";
export type TiktokEventType = TiktokTopEventType | TiktokBottomEventType;

export interface TiktokUser {
	userId: string;
	username: string;
	followers: number;
}

export interface TiktokEngagementTop {
	watchTime: number;
	percentageWatched: number;
	device: "Android" | "iOS" | "Desktop";
	country: string;
	videoId: string;
}

export interface TiktokEngagementBottom {
	actionTime: string;
	profileId: string | null;
	purchasedItem: string | null;
	purchaseAmount: string | null;
}

export type TiktokEngagement = TiktokEngagementTop | TiktokEngagementBottom;

export interface TiktokEvent {
	eventId: string;
	timestamp: string;
	source: "tiktok";
	funnelStage: FunnelStage;
	eventType: TiktokEventType;
	data: {
		user: TiktokUser;
		engagement: TiktokEngagement;
	};
}