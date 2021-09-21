var verificationInstances = [];

$(this).translate();

Fliplet.Widget.instance('email-verification', function(data) {
  var widgetId = data.id;
  var verificationReady;
  var verificationPromise = new Promise(function(resolve) {
    verificationReady = resolve;
  });

  var type = 'email';
  var dataSourceId = _.hasIn(data, 'validation.dataSourceQuery.dataSourceId')
    ? data.validation.dataSourceQuery.dataSourceId
    : null;
  var columns = _.hasIn(data, 'validation.dataSourceQuery.columns')
    ? data.validation.dataSourceQuery.columns
    : null;

  // Do not track login related redirects
  if (typeof data.action !== 'undefined') {
    data.action.track = false;
  }

  function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    return re.test(email);
  }

  function calculateElHeight(el) {
    var parentUUID = el.parent().attr('data-email-verification-uuid');
    var elementHeight = el.outerHeight(true);

    if (el.hasClass('start')) {
      $('[data-email-verification-uuid="' + parentUUID + '"]').children('.state.start');

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
    emailErrorMessage: '',
    code: null,
    codeError: false,
    codeErrorMessage: '',
    storedEmail: '',
    resentCode: false,
    sendValidationLabel: 'Continue',
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
      createUserProfile: function(entry) {
        entry = entry || {};

        if (!entry.dataSourceId || !entry.id) {
          return;
        }

        return {
          type: 'dataSource',
          dataSourceId: entry.dataSourceId,
          dataSourceEntryId: entry.id
        };
      },
      sendValidation: function() {
        this.sendValidationLabel = T('widgets.emailVerification.dataSource.verifyingLabel');
        this.disableButton = true;

        if (!validateEmail(this.email)) {
          this.emailError = true;
          this.emailErrorMessage = T('widgets.emailVerification.dataSource.emailErrorMessage');
          this.sendValidationLabel = T('widgets.emailVerification.dataSource.sendValidationLabel');
          this.disableButton = false;

          return Promise.reject(this.emailErrorMessage);
        }

        Fliplet.Analytics.trackEvent({
          category: 'email_verification',
          action: 'code_request'
        });

        return Fliplet.DataSources.connect(dataSourceId, {
          offline: false
        })
          .then(function(dataSource) {
            var where = {};

            where[columns[type + 'Match']] = vmData.email;

            return dataSource.sendValidation({
              type: type,
              where: where
            })
              .then(function() {
                Fliplet.App.Storage.set('user-email', vmData.email);
                vmData.storedEmail = vmData.email;
                app.showVerify();
                vmData.sendValidationLabel = T('widgets.emailVerification.dataSource.sendValidationLabel');
                vmData.disableButton = false;
              })
              .catch(function(err) {
                vmData.emailErrorMessage = Fliplet.parseError(err) || T('widgets.emailVerification.dataSource.errorVerifyingEmail');
                vmData.emailError = true;
                vmData.sendValidationLabel = T('widgets.emailVerification.dataSource.sendValidationLabel');
                vmData.disableButton = false;

                return Promise.reject(vmData.emailErrorMessage);
              });
          });
      },
      validate: function() {
        Fliplet.Analytics.trackEvent({
          category: 'email_verification',
          action: 'code_verify'
        });

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
                    var user = app.createUserProfile(entry);

                    return Promise.all([
                      Fliplet.App.Storage.set({
                        'fl-chat-source-id': entry.dataSourceId,
                        'fl-chat-auth-email': vmData.email,
                        'fl-email-verification': entry
                      }),
                      Fliplet.Profile.set({
                        'email': vmData.email,
                        'user': user
                      })
                    ]).then(function() {
                      return Fliplet.Hooks.run('onUserVerified', {
                        entry: entry
                      });
                    });
                  })
                  .then(function() {
                    Fliplet.Analytics.trackEvent({
                      category: 'email_verification',
                      action: 'authenticate_pass'
                    });
                    vmData.verifyCode = false;
                    vmData.confirmation = true;
                    vmData.codeError = false;
                    vmData.resentCode = false;
                  })
                  .catch(function(error) {
                    Fliplet.Analytics.trackEvent({
                      category: 'email_verification',
                      action: 'authenticate_fail'
                    });
                    vmData.codeError = true;
                    vmData.codeErrorMessage = Fliplet.parseError(error);
                    vmData.resentCode = false;
                  });
              });
          });
      },
      showVerify: function() {
        vmData.auth = false;
        vmData.verifyCode = true;
        vmData.emailError = false;
        this.$refs.verificationCode.select();
      },
      haveCode: function() {
        Fliplet.Analytics.trackEvent({
          category: 'email_verification',
          action: 'request_skip'
        });

        this.showVerify();
      },
      resendCode: function() {
        Fliplet.Analytics.trackEvent({
          category: 'email_verification',
          action: 'code_resend'
        });

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
        var $vm = this;

        setTimeout(function nextTick() {
          // Wait for keyboard to be dismissed before calculating element height
          calculateElHeight($($vm.$el).find('.state[data-state=' + state + ']'));
        }, 0);
      }
    },
    mounted: function() {
      var vm = this;

      // After half a second show auth
      setTimeout(function() {
        var selector = '.fl-email-verification[data-email-verification-id="' + vmData.widgetId + '"]';

        vmData.auth = true;
        calculateElHeight($(selector).find('.state[data-state=auth]'));
        vmData.loading = false;

        verificationReady({
          instance: vm,
          setEmail: function(email) {
            vm.email = email;
          },
          requestCode: function() {
            return vm.sendValidation();
          }
        });
      }, 500);

      // Check if user is already verified
      if (!Fliplet.Env.get('disableSecurity')) {
        Fliplet.User.getCachedSession()
          .then(function(session) {
            if (!session || !session.accounts) {
              return Promise.reject(T('widgets.emailVerification.dataSource.loginNotFound'));
            }

            var dataSource = session.accounts.dataSource || [];
            var verifiedAccounts = dataSource.filter(function(dataSourceAccount) {
              return dataSourceAccount.dataSourceId === dataSourceId;
            });

            if (!verifiedAccounts.length) {
              return Promise.reject(T('widgets.emailVerification.dataSource.loginNotFound'));
            }

            // Update stored email address based on retrieved session
            var entry = verifiedAccounts[0];
            var email = entry.data[columns[type + 'Match']];
            var user = app.createUserProfile(entry);

            return Promise.all([
              Fliplet.App.Storage.set({
                'fl-chat-source-id': entry.dataSourceId,
                'fl-chat-auth-email': email,
                'fl-email-verification': entry
              }),
              Fliplet.Profile.set({
                'email': email,
                'user': user
              })
            ]);
          })
          .then(function() {
            var navigate = Fliplet.Navigate.to(data.action);

            if (typeof navigate === 'object' && typeof navigate.then === 'function') {
              return navigate;
            }

            return Promise.resolve();
          })
          .catch(function(error) {
            console.warn(error);
          });
      }

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

  verificationInstances.push(verificationPromise);
});

Fliplet.Verification = Fliplet.Verification || {};

Fliplet.Verification.Email = {
  get: function() {
    return Promise.all(verificationInstances).then(function(instances) {
      return _.first(instances);
    });
  }
};
