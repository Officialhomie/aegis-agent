/**
 * Aegis Agent - Campaign module
 * Targeted sponsorship campaigns with count limits and reporting.
 */

export {
  createCampaign,
  getCampaign,
  getActiveCampaignForProtocol,
  recordSponsorshipInCampaign,
  isCampaignComplete,
  deactivateCampaign,
  getCampaignReport,
  type SponsorshipCampaign,
  type CampaignStatus,
  type CampaignReport,
  type CampaignReportTransaction,
} from './campaign-manager';
