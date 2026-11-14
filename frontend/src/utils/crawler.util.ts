// Link preview bots of chat apps and social networks. They don't run
// JavaScript, so the preview data has to be part of the server rendered HTML.
const LINK_PREVIEW_BOTS =
  /Discordbot|Slackbot|Slack-ImgProxy|TelegramBot|Twitterbot|facebookexternalhit|WhatsApp|LinkedInBot|Mastodon|Pleroma|Misskey|Matrix|SkypeUriPreview|Embedly|redditbot|Signal|iMessage|Applebot|bot|crawler|spider|preview/i;

export const isLinkPreviewBot = (userAgent?: string): boolean =>
  !!userAgent && LINK_PREVIEW_BOTS.test(userAgent);
