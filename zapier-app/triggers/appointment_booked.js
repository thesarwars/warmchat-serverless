const { BASE_URL } = require('../constants');

const performSubscribe = (z, bundle) =>
  z
    .request({
      url: `${BASE_URL}/hooks`,
      method: 'POST',
      body: { event: 'appointment.booked', target_url: bundle.targetUrl },
    })
    .then((res) => res.data);

const performUnsubscribe = (z, bundle) =>
  z
    .request({ url: `${BASE_URL}/hooks/${bundle.subscribeData.id}`, method: 'DELETE' })
    .then((res) => res.data);

const perform = (z, bundle) => {
  const d = bundle.cleanedRequest.data || {};
  return [{ id: d.appointment_id, ...d }];
};

const performList = (z) =>
  z.request({ url: `${BASE_URL}/appointments`, params: { limit: 25 } }).then((res) => res.data);

module.exports = {
  key: 'appointment_booked',
  noun: 'Appointment',
  display: {
    label: 'Appointment Booked',
    description: 'Triggers when an appointment is booked with a lead.',
  },
  operation: {
    type: 'hook',
    performSubscribe,
    performUnsubscribe,
    perform,
    performList,
    sample: {
      id: 1,
      appointment_id: 1,
      lead_id: 1,
      starts_at: '2026-06-02T17:00:00.000Z',
      appointment_type: 'Buyer consultation',
      meeting_type: 'phone',
      lead_name: 'Jordan Rivera',
    },
    outputFields: [
      { key: 'appointment_id', label: 'Appointment ID', type: 'integer' },
      { key: 'lead_id', label: 'Lead ID', type: 'integer' },
      { key: 'starts_at', label: 'Starts At' },
      { key: 'appointment_type', label: 'Type' },
      { key: 'meeting_type', label: 'Meeting Type' },
      { key: 'lead_name', label: 'Lead Name' },
    ],
  },
};
