const { BASE_URL } = require('../constants');

const perform = (z, bundle) =>
  z
    .request({
      url: `${BASE_URL}/leads/${bundle.inputData.lead_id}/tags`,
      method: 'POST',
      body: { tag: bundle.inputData.tag },
    })
    .then((res) => res.data);

module.exports = {
  key: 'add_tag',
  noun: 'Tag',
  display: { label: 'Add Tag to Lead', description: 'Attaches a tag to a lead, creating the tag if needed.' },
  operation: {
    perform,
    inputFields: [
      { key: 'lead_id', label: 'Lead ID', type: 'integer', required: true },
      { key: 'tag', label: 'Tag', required: true },
    ],
    sample: { ok: true, lead_id: 1, tag: 'VIP' },
  },
};
