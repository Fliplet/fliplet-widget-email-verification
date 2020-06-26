// interface js

var widgetId = Fliplet.Widget.getDefaultId();
var data = Fliplet.Widget.getData(widgetId) || {};
var appId = Fliplet.Env.get('appId');
var page = Fliplet.Widget.getPage();
var omitPages = page ? [page.id] : [];

// Preselect verification type
data.validation = data.validation || {};
data.validation.type = 'email';


if (!data.action) {
  data.action = {
    action: 'screen',
    page: '',
    omitPages: omitPages,
    transition: 'fade',
    options: {
      hideAction: true
    }
  };
}

checkSecurityRules();

var linkActionProvider = Fliplet.Widget.open('com.fliplet.link', {
  selector: '#link-actions',
  data: data.action,
  closeOnSave: false,
  onEvent: function(event, data) {
    if (event === 'interface-validate') {
      Fliplet.Widget.toggleSaveButton(data.isValid === true);
    }
  }
});

var validationProvider = Fliplet.Widget.open('com.fliplet.validation-manager', {
  selector: '#validation',
  data: data.validation,
  closeOnSave: false,
  onEvent: function(event, data) {
    if (event === 'interface-validate') {
      Fliplet.Widget.toggleSaveButton(data.isValid === true);
    }
  }
});

Fliplet.Widget.onCancelRequest(function() {
  validationProvider.forwardCancelRequest();
});

// 1. Fired from Fliplet Studio when the external save button is clicked
Fliplet.Widget.onSaveRequest(function() {
  $('form').submit();
});

// 2. Fired when the user submits the form
$('form').submit(function(event) {
  event.preventDefault();
  linkActionProvider.forwardSaveRequest();
});

// 3. Fired when the provider has finished
linkActionProvider.then(function(result) {
  data.action = result.data;
  data.action.omitPages = omitPages;
  validationProvider.forwardSaveRequest();
});

validationProvider.then(function(result) {
  data.validation = result.data;
  save(true);
});

function save(notifyComplete) {
  // Get and save values to data
  Fliplet.Widget.save(data).then(function() {
    if (notifyComplete) {
      Fliplet.Widget.complete();
      Fliplet.Studio.emit('reload-page-preview');
    } else {
      Fliplet.Studio.emit('reload-widget-instance', widgetId);
    }
  });
}

// Shows warning if security setting are not configured correctly
function checkSecurityRules() {
  Fliplet.API.request('v1/apps/' + appId).then(function(result) {
    if (!result || !result.app) {
      return;
    }

    var hooks = _.get(result.app, 'hooks', []);
    var isSecurityConfigured = _.some(hooks, function(hook) {
      return hook.script.indexOf(page.id) !== -1;
    });

    if (!hooks.length) {
      $('#security-alert span').text('app has no security rules configured to prevent unauthorized access.');
    }

    $('#security-alert').toggleClass('hidden', isSecurityConfigured);
  });
}

// Open security overlay
$('#security-alert u').on('click', function() {
  Fliplet.Studio.emit('overlay', {
    name: 'app-settings',
    options: {
      title: 'App Settings',
      size: 'large',
      section: 'appSecurity',
      appId: appId
    }
  });
});
