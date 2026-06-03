const { version } = require('./package.json');
const { version: platformVersion } = require('zapier-platform-core');

const authentication = require('./authentication');
const { addBearer } = require('./middleware');

const newLead = require('./triggers/new_lead');
const leadReplied = require('./triggers/lead_replied');
const leadStatusChanged = require('./triggers/lead_status_changed');
const appointmentBooked = require('./triggers/appointment_booked');

const createLead = require('./creates/create_lead');
const addTag = require('./creates/add_tag');
const enrollLead = require('./creates/enroll_lead');

const findLead = require('./searches/find_lead');

module.exports = {
  version,
  platformVersion,

  authentication,
  beforeRequest: [addBearer],

  triggers: {
    [newLead.key]: newLead,
    [leadReplied.key]: leadReplied,
    [leadStatusChanged.key]: leadStatusChanged,
    [appointmentBooked.key]: appointmentBooked,
  },

  creates: {
    [createLead.key]: createLead,
    [addTag.key]: addTag,
    [enrollLead.key]: enrollLead,
  },

  searches: {
    [findLead.key]: findLead,
  },
};
