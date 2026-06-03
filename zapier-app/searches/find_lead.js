const { BASE_URL } = require('../constants');

// Returns matching leads (array). Pair with "Create or Update Lead" in Zapier
// to build a find-or-create step.
const perform = (z, bundle) =>
  z
    .request({
      url: `${BASE_URL}/leads`,
      params: { email: bundle.inputData.email, phone: bundle.inputData.phone },
    })
    .then((res) => res.data);

module.exports = {
  key: 'find_lead',
  noun: 'Lead',
  display: { label: 'Find Lead', description: 'Finds a lead by email or phone number.' },
  operation: {
    perform,
    inputFields: [
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
    ],
    sample: { id: 1, name: 'Jordan Rivera', email: 'jordan@example.com', phone: '+15551230000' },
    outputFields: [
      { key: 'id', label: 'Lead ID', type: 'integer' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
    ],
  },
};
