const { BASE_URL } = require('../constants');

const perform = (z, bundle) =>
  z
    .request({
      url: `${BASE_URL}/leads/${bundle.inputData.lead_id}/enroll`,
      method: 'POST',
      body: {
        automation_id: bundle.inputData.automation_id,
        inbound_enabled: bundle.inputData.inbound_enabled,
        enabled: bundle.inputData.enabled,
      },
    })
    .then((res) => res.data);

module.exports = {
  key: 'enroll_lead',
  noun: 'Enrollment',
  display: {
    label: 'Enroll Lead in AI Workflow',
    description: 'Enrolls a lead into an automation drip and/or enables AI inbound replies.',
  },
  operation: {
    perform,
    inputFields: [
      { key: 'lead_id', label: 'Lead ID', type: 'integer', required: true },
      { key: 'automation_id', label: 'Automation ID', type: 'integer', helpText: 'Optional. The outbound drip to enroll into.' },
      { key: 'inbound_enabled', label: 'Enable AI inbound replies', type: 'boolean' },
      {
        key: 'enabled',
        label: 'Enabled',
        type: 'boolean',
        helpText: 'Set to No to pause AI for this lead and cancel any pending drip.',
      },
    ],
    sample: { ok: true, ai_status: 'active' },
  },
};
