const { BASE_URL } = require('../constants');

// REST Hook: WarmChats POSTs { event, org_id, occurred_at, data: { lead } }.
const performSubscribe = (z, bundle) =>
  z
    .request({
      url: `${BASE_URL}/hooks`,
      method: 'POST',
      body: { event: 'lead.created', target_url: bundle.targetUrl },
    })
    .then((res) => res.data);

const performUnsubscribe = (z, bundle) =>
  z
    .request({ url: `${BASE_URL}/hooks/${bundle.subscribeData.id}`, method: 'DELETE' })
    .then((res) => res.data);

const perform = (z, bundle) => [bundle.cleanedRequest.data.lead];

// Sample data + polling fallback (Zapier "load more"): most recent leads.
const performList = (z) =>
  z.request({ url: `${BASE_URL}/leads`, params: { limit: 25 } }).then((res) => res.data);

module.exports = {
  key: 'new_lead',
  noun: 'Lead',
  display: { label: 'New Lead', description: 'Triggers when a new lead is created in WarmChats.' },
  operation: {
    type: 'hook',
    performSubscribe,
    performUnsubscribe,
    perform,
    performList,
    sample: {
      id: 1,
      name: 'Jordan Rivera',
      first_name: 'Jordan',
      last_name: 'Rivera',
      email: 'jordan@example.com',
      phone: '+15551230000',
      status: 'New',
      source: 'ManyChat',
      platform: 'Instagram',
      external_id: 'mc_8675309',
    },
    outputFields: [
      { key: 'id', label: 'Lead ID', type: 'integer' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'source', label: 'Source' },
      { key: 'platform', label: 'Platform' },
      { key: 'external_id', label: 'External ID' },
    ],
  },
};
