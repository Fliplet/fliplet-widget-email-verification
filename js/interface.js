//interface js

var widgetId = Fliplet.Widget.getDefaultId();
var data = Fliplet.Widget.getData(widgetId) || {};
var validInputEventName = 'interface-validate';

// Preselect verification type
data.validation = data.validation || {};
data.validation.type = 'email';


if (!data.action) {
  data.action = {
    action: 'screen',
    page: '',
    transition: 'fade',
    options: {
      hideAction: true
    }
  };
}

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
