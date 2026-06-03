const { BASE_URL } = require('../constants');

const performSubscribe = (z, bundle) =>
  z
    .request({
      url: `${BASE_URL}/hooks`,
      method: 'POST',
      body: { event: 'lead.replied', target_url: bundle.targetUrl },
    })
    .then((res) => res.data);

const performUnsubscribe = (z, bundle) =>
  z
    .request({ url: `${BASE_URL}/hooks/${bundle.subscribeData.id}`, method: 'DELETE' })
    .then((res) => res.data);

// Flatten { data: { lead_id, message, lead } } into one record with a composite
// id so each reply (not just each lead) triggers exactly once.
const perform = (z, bundle) => {
  const body = bundle.cleanedRequest;
  const d = body.data || {};
  return [
    {
      ...(d.lead || {}),
      lead_id: d.lead_id,
      message: d.message,
      replied_at: body.occurred_at,
      id: `${d.lead_id}:${body.occurred_at}`,
    },
  ];
};

const performList = (z) =>
  z.request({ url: `${BASE_URL}/replies`, params: { limit: 25 } }).then((res) =>
    res.data.map((x) => ({
      ...(x.lead || {}),
      lead_id: x.lead_id,
      replied_at: x.replied_at,
      id: x.id,
    })),
  );

module.exports = {
  key: 'lead_replied',
  noun: 'Reply',
  display: { label: 'Lead Replied', description: 'Triggers when a lead replies to a message.' },
  operation: {
    type: 'hook',
    performSubscribe,
    performUnsubscribe,
    perform,
    performList,
    sample: {
      id: '1:2026-05-31T12:00:00.000Z',
      lead_id: 1,
      name: 'Jordan Rivera',
      message: 'Yes, I am looking to buy.',
      replied_at: '2026-05-31T12:00:00.000Z',
    },
    outputFields: [
      { key: 'lead_id', label: 'Lead ID', type: 'integer' },
      { key: 'name', label: 'Name' },
      { key: 'message', label: 'Reply Text' },
      { key: 'replied_at', label: 'Replied At' },
    ],
  },
};
