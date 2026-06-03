const { BASE_URL } = require('../constants');

const perform = (z, bundle) =>
  z
    .request({ url: `${BASE_URL}/leads`, method: 'POST', body: bundle.inputData })
    .then((res) => res.data.lead);

module.exports = {
  key: 'create_lead',
  noun: 'Lead',
  display: {
    label: 'Create or Update Lead',
    description:
      'Creates a lead in WarmChats, or updates the existing one (matched by External ID, then email, then phone). Optionally enrolls it in the AI workflow.',
  },
  operation: {
    perform,
    inputFields: [
      {
        key: 'external_id',
        label: 'External ID',
        helpText: 'Source system id (e.g. the ManyChat subscriber id). Used to avoid duplicates on re-runs.',
      },
      { key: 'first_name', label: 'First Name' },
      { key: 'last_name', label: 'Last Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'company', label: 'Company' },
      { key: 'source', label: 'Lead Source', helpText: 'e.g. ManyChat' },
      { key: 'platform', label: 'Platform', helpText: 'e.g. Instagram, Facebook, Website' },
      { key: 'status', label: 'Status', helpText: 'Defaults to New.' },
      { key: 'notes', label: 'Notes', type: 'text' },
      {
        key: 'sms_consent_status',
        label: 'SMS Consent',
        choices: { unknown: 'Unknown', opted_in: 'Opted in', opted_out: 'Opted out' },
        helpText: 'Leave as Unknown unless the lead explicitly consented to texts. Sends stay compliance-gated either way.',
      },
      {
        key: 'automation_id',
        label: 'Enroll in Automation (ID)',
        type: 'integer',
        helpText: 'Optional. Enroll the lead into this automation drip (the AI intake workflow).',
      },
      {
        key: 'inbound_enabled',
        label: 'Enable AI inbound replies',
        type: 'boolean',
        helpText: 'Optional. Let the AI auto-reply when this lead writes back.',
      },
    ],
    sample: {
      id: 1,
      name: 'Jordan Rivera',
      email: 'jordan@example.com',
      phone: '+15551230000',
      status: 'New',
      source: 'ManyChat',
      platform: 'Instagram',
    },
    outputFields: [
      { key: 'id', label: 'Lead ID', type: 'integer' },
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
  },
};
