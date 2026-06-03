const { BASE_URL } = require('./constants');

// API Key auth: the user pastes a key generated in
// WarmChats > Connected Accounts > API & Integrations. We validate it by
// calling GET /me and label the connection with the org name.
const test = (z) => z.request({ url: `${BASE_URL}/me` }).then((res) => res.data);

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      required: true,
      type: 'string',
      helpText:
        'Generate a key in WarmChats > Connected Accounts > API & Integrations, then paste it here.',
    },
  ],
  test,
  connectionLabel: '{{org_name}}',
};
