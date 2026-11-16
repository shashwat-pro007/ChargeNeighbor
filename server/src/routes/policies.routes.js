import express from 'express';
import { config } from '../config.js';
import {
  cancellation,
  bookingRules,
  fees,
  policyDocuments,
  policyIndex,
} from '../config/policies.js';
import { notFound } from '../lib/errors.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    policies: policyIndex,
    meta: {
      effectiveDate: policyDocuments[0].updated,
      operator: 'ChargeNeighbor',
      cancellation,
      bookingRules,
      fees,
      platformFeePercent: config.platformFeePercent,
      currency: config.currency,
      paymentsMode: config.paymentsMode,
      gracePeriodMinutes: bookingRules.gracePeriodMinutes,
      minLeadMinutes: config.minLeadMinutes,
    },
  });
});

router.get('/:slug', (req, res, next) => {
  const doc = policyDocuments.find((item) => item.slug === req.params.slug);
  if (!doc) return next(notFound('That policy page does not exist.'));
  return res.json({ policy: doc });
});

export default router;
