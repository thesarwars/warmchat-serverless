const { BASE_URL } = require('../constants');

const performSubscribe = (z, bundle) =>
  z
    .request({
      url: `${BASE_URL}/hooks`,
      method: 'POST',
      body: { event: 'lead.status_changed', target_url: bundle.targetUrl },
    })
    .then((res) => res.data);

const performUnsubscribe = (z, bundle) =>
  z
    .request({ url: `${BASE_URL}/hooks/${bundle.subscribeData.id}`, method: 'DELETE' })
    .then((res) => res.data);

const perform = (z, bundle) => {
  const body = bundle.cleanedRequest;
  const d = body.data || {};
  return [
    {
      ...(d.lead || {}),
      lead_id: d.lead_id,
      status: d.status,
      changed_at: body.occurred_at,
      id: `${d.lead_id}:${d.status}:${body.occurred_at}`,
    },
  ];
};

const performList = (z) =>
  z.request({ url: `${BASE_URL}/leads`, params: { limit: 25 } }).then((res) =>
    res.data.map((l) => {
      const status = l.qualification_status || l.status;
      return { ...l, lead_id: l.id, status, changed_at: l.updated_at, id: `${l.id}:${status}:${l.updated_at}` };
    }),
  );

module.exports = {
  key: 'lead_status_changed',
  noun: 'Lead',
  display: {
    label: 'Lead Status Changed',
    description: 'Triggers when a lead reaches a new stage (e.g. booking-ready or cold).',
  },
  operation: {
    type: 'hook',
    performSubscribe,
    performUnsubscribe,
    perform,
    performList,
    sample: {
      id: '1:booking_ready:2026-05-31T12:00:00.000Z',
      lead_id: 1,
      name: 'Jordan Rivera',
      status: 'booking_ready',
      changed_at: '2026-05-31T12:00:00.000Z',
    },
    outputFields: [
      { key: 'lead_id', label: 'Lead ID', type: 'integer' },
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
      { key: 'changed_at', label: 'Changed At' },
    ],
  },
};
