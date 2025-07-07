import {FunnelStage} from './funnel-stage';

export type FacebookTopEventType = "ad.view" | "page.like" | "comment" | "video.view";
export type FacebookBottomEventType = "ad.click" | "form.submission" | "checkout.complete";
export type FacebookEventType = FacebookTopEventType | FacebookBottomEventType;

export interface FacebookUserLocation {
	country: string;
	city: string;
}

export interface FacebookUser {
	userId: string;
	name: string;
	age: number;
	gender: "male" | "female" | "non-binary";
	location: FacebookUserLocation;
}

export interface FacebookEngagementTop {
	actionTime: string;
	referrer: "newsfeed" | "marketplace" | "groups";
	videoId: string | null;
}

export interface FacebookEngagementBottom {
	adId: string;
	campaignId: string;
	clickPosition: "top_left" | "bottom_right" | "center";
	device: "mobile" | "desktop";
	browser: "Chrome" | "Firefox" | "Safari";
	purchaseAmount: string | null;
}

export type FacebookEngagement = FacebookEngagementTop | FacebookEngagementBottom;

export interface FacebookEvent {
	eventId: string;
	timestamp: string;
	source: "facebook";
	funnelStage: FunnelStage;
	eventType: FacebookEventType;
	data: {
		user: FacebookUser;
		engagement: FacebookEngagement;
	};
}