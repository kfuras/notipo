import Stripe from "stripe";
import { config } from "../config.js";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!config.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!_stripe) {
    _stripe = new Stripe(config.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return !!(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET && config.STRIPE_PRO_PRICE_ID);
}
