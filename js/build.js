Fliplet().then(function() {
  $('.fl-email-verification').each(function() {
    var $el = $(this);
    var widgetId = $el.data('email-verification-id');
    var data = Fliplet.Widget.getData(widgetId) || {};

    var dataSourceId = data.validation.dataSourceQuery.dataSourceId;
    var type = 'email';
    var columns = data.validation.dataSourceQuery.columns;

    function validateEmail(email) {
      var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      return re.test(email);
    }

    function calculateElHeight(el) {
      var parentUUID = el.parent().attr('data-email-verification-uuid');
      var elementHeight = el.outerHeight(true);

      if (el.hasClass('start')) {
        $('[data-email-verification-uuid="' + parentUUID + '"]').children('.state.start')
        if (vmData.storedEmail) {
          $('[data-email-verification-uuid="' + parentUUID + '"]').children('.state.start').addClass('has-code');
        }
        setTimeout(function() {
          $('[data-email-verification-uuid="' + parentUUID + '"]').children('.state.start').removeClass('start').addClass('present');
        }, 1000);
      }

      el.parents('.content-wrapper').css('height', elementHeight);
      el.css('overflow', 'auto');
    }

    var vmData = {
      loading: true,
      auth: false,
      verifyCode: false,
      confirmation: false,
      email: null,
      emailError: false,
      code: null,
      codeError: false,
      storedEmail: '',
      resentCode: false,
      sendValidationLabel: 'Authenticate',
      widgetId: widgetId,
      disableButton: false,
      type: type,
      deviceOffline: false,
      securityError: undefined
    };

    var app = new Vue({
      el: this,
      data: vmData,
      methods: {
        redirect: function() {
          // Redirect
          if (data.action) {
            // The time out is to prevent weird transitions between screens on mobile
            setTimeout(function() {
              Fliplet.Navigate.to(data.action);
            }, 1000);
          }
        },
        sendValidation: function() {
          this.sendValidationLabel = 'Authenticating...';
          this.disableButton = true;
          if (!validateEmail(this.email)) {
            this.emailError = true;
            this.sendValidationLabel = 'Authenticate';
            this.disableButton = false;
            return;
          }

          Fliplet.DataSources.connect(dataSourceId, {
              offline: false
            })
            .then(function(dataSource) {
              var where = {};

              where[columns[type + 'Match']] = vmData.email;
              dataSource.sendValidation({
                  type: type,
                  where: where
                })
                .then(function() {
                  Fliplet.App.Storage.set('user-email', vmData.email);
                  vmData.storedEmail = vmData.email;
                  app.showVerify();
                  vmData.sendValidationLabel = 'Authenticate';
                  vmData.disableButton = false;
                })
                .catch(function() {
                  vmData.emailError = true;
                  vmData.sendValidationLabel = 'Authenticate';
                  vmData.disableButton = false;
                });
            });
        },
        validate: function() {
          Fliplet.DataSources.connect(dataSourceId, {
              offline: false
            })
            .then(function(dataSource) {
              var where = {
                code: vmData.code
              };
              where[columns[type + 'Match']] = vmData.email;

              Fliplet.Session.get()
                .then(function() {
                  dataSource.validate({
                      type: type,
                      where: where
                    })
                    .then(function(entry) {
                      return Promise.all([
                        Fliplet.App.Storage.set('fl-chat-source-id', entry.dataSourceId),
                        Fliplet.App.Storage.set('fl-chat-auth-email', vmData.email),
                        Fliplet.App.Storage.set('fl-email-verification', entry),
                        Fliplet.Profile.set('email', vmData.email),
                        Fliplet.Hooks.run('onUserVerified', {
                          entry: entry
                        })
                      ]);
                    })
                    .then(function() {
                      vmData.verifyCode = false;
                      vmData.confirmation = true;
                      vmData.codeError = false;
                      vmData.resentCode = false;
                    })
                    .catch(function(error) {
                      vmData.codeError = true;
                      vmData.resentCode = false;
                    });
                });
            });
        },
        showVerify: function() {
          vmData.auth = false;
          vmData.verifyCode = true;
          vmData.emailError = false;
        },
        resendCode: function() {
          Fliplet.DataSources.connect(dataSourceId, {
              offline: false
            })
            .then(function(dataSource) {
              var where = {};
              where[columns[type + 'Match']] = vmData.email;
              dataSource.sendValidation({
                type: type,
                where: where
              });
              vmData.codeError = false;
              vmData.resentCode = true;
            });
        },
        back: function() {
          vmData.code = '';
          vmData.codeError = false;
          vmData.resentCode = false;
          vmData.auth = true;
          vmData.verifyCode = false;
        },
        changeState: function(state) {
          calculateElHeight($(this.$el).find('.state[data-state=' + state + ']'));
        }
      },
      mounted: function() {
        // After half a second show auth
        setTimeout(function() {
          var selector = '.fl-email-verification[data-email-verification-id="' + vmData.widgetId + '"]';
          vmData.auth = true;
          calculateElHeight($(selector).find('.state[data-state=auth]'));
          vmData.loading = false;
        }, 500);

        // Check if user is already verified
        Fliplet.App.Storage.get('fl-email-verification')
          .then(function(value) {
            if (!value) {
              return;
            }
            setTimeout(function() {
              Fliplet.Navigate.to(data.action);
            }, 1000);
          });

        // Check if user was already around...
        Fliplet.App.Storage.get('user-email')
          .then(function(email) {
            if (!email) {
              return;
            }

            vmData.email = email;
            vmData.storedEmail = email;
          });

        // Check if there are errors from SAML2 features
        if (Fliplet.Navigate.query.error) {
          vmData.securityError = Fliplet.Navigate.query.error;
        }

        // Online/ Offline handlers
        Fliplet.Navigator.onOnline(function() {
          vmData.deviceOffline = false;
        });

        Fliplet.Navigator.onOffline(function() {
          vmData.deviceOffline = true;
        });
      },
      watch: {
        auth: function(newVal) {
          if (newVal) {
            app.changeState('auth');
          }
        },
        verifyCode: function(newVal) {
          if (newVal) {
            app.changeState('verify-code');
          }
        },
        confirmation: function(newVal) {
          if (newVal) {
            app.changeState('confirmation');
          }
        },
        emailError: function(newVal) {
          if (newVal) {
            setTimeout(function() {
              app.changeState('auth');
            }, 0);
          }
        },
        codeError: function(newVal) {
          if (newVal) {
            setTimeout(function() {
              app.changeState('verify-code');
            }, 0);
          }
        },
        resentCode: function(newVal) {
          if (newVal) {
            setTimeout(function() {
              app.changeState('verify-code');
            }, 0);
          }
        }
      }
    });
  });
});
