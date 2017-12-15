const _ = require('lodash');
const Knex = require('knex');
const Joi = require('joi');
const difference = require('lodash.difference')

module.exports = function (Bookshelf) {

  const proto = Bookshelf.Model.prototype;
  const Model = Bookshelf.Model.extend({

    /**
    * Hash of translatable fields
    * @type {Object}
    */
    translatable: {},

    /**
    * Override model constructor
    */
    constructor: function (attributes, options) {
      /**
      * Reference to the knex instance for table used
      * to store translations
      * @type {?knex}
      */
      this._knex_locale = null,

      /**
      * Current locale
      * @type {string}
      */
      this.currentLocale = 'en';

      /**
      * Default (fallback) locale
      * @type {string}
      */
      this.defaultLocale = 'en';

      /**
      * Translation variations
      * @type {Object}
      * @private
      */
      this._translationVariations = {};

      if (_.has(options, 'locale')) {
        this.setLocale(options.locale);
      }

      if (! this.translationTableName) {
        this.translationTableName = _.result(this, 'tableName') + '_locale';
      }

      if (_.keys(this.translatable).length > 0) {
        //Only initialize another knex instance for translattion table if needed
        this._knex_locale = this._builder(this.translationTableName);
        this.on("fetched", this.fetchTranslatable);
      }

      proto.constructor.apply(this, arguments);
    },

    /**
    * Sets the locale for translatable fields
    * @type {string} locale - new locale to set
    */
    setLocale: function (locale) {
      this.currentLocale = locale;
    },

    /**
    * Returns currently set locale for translatable fields
    * @return {string}
    */
    getLocale: function () {
      return this.currentLocale;
    },

    /**
    * Override original getter to support localizible fields
    */
    get: function (field) {
      if (_.isObject(this.translatable) && this.translatable[field]) {
        return this.getTranslation(field);
      }

      //Not translatable, call original getter:
      return proto.get.apply(this, arguments);
    },

    /**
    * Override original setter to support saving localizible field
    */
    set: function (key, value, options) {
      if (key == null) {
        return this;
      }

      if (_.isObject(key)) {
        const nonTranslatable = _.omitBy(key, this.setTranslation.bind(this));
        return proto.set.call(this, nonTranslatable, options);
      }

      if (this.setTranslation(value, key)) {
        return this;
      }

      return proto.set.apply(this, arguments);
    },

    /**
    * Override original save method to support saving of localizible fields.
    */
    save: function(key, value, options) {
      let attrs;

      if (key == null || typeof key === "object") {
        attrs = key && _.clone(key) || {};
        options = _.clone(value) || {};
      } else {
        (attrs = {})[key] = value;
        options = options ? _.clone(options) : {};
      }

      // Determine whether which kind of save we will do, update or insert.
      options.method = this.saveMethod(options);

      if (options.method === 'update' && options.patch) {
         // Any setter could throw. We need to reject `save` if they do.
         try {

           // Check if any of the patch attributes are translatables. If so call their
           // setter.
           _.each(attrs, (function (value, key) {

             if (this.setTranslation(value, key)) {
               // This was a translatable, so remove it from the attributes to be
               // passed to `Model.save`.
               delete attrs[key];
             }

           }).bind(this));

         } catch (e) {
           return Promise.reject(e);
         }
      }


      return proto.save.call(this, attrs, options)
      .bind(this)
      .then (function () {
        return this.saveTranslations(options);
      })
      .return(this);

    },

    /**
    * Override original serialize method to expose translatable fields
    * @param {Object} options
    */
    serialize: function (options) {
      let serialized = proto.serialize.call(this, options);

      for (let field in this.translatable) {
        serialized[field] = this.getTranslation(field);
      }

      return serialized;
    },

    /**
    * Returns translated value for specifield field and currently set locale,
    * lookups on default (fallback) locale if not found in currently set locale.
    * @param {string} field - requested translatabe field
    * @return {string|undefined}
    */
    getTranslation: function (field) {
      if (! _.has(this.translatable, field)) {
        return undefined;
      }

      let translation = this.getTranslationForLocale(field, this.currentLocale);
      if (translation !== undefined) {
        return translation;
      }

      if (this.currentLocale === this.defaultLocale) {
        //Current locale is the deffault (fallback). Translation not found
        return undefined;
      }

      //Failed to lookup in current locale, try to lookup in fallback locale:
      return this.getTranslationForLocale(field, this.defaultLocale);
    },

    /**
    * Lookups the value for specified field in specified locale
    * Returns undefined if not found.
    * @param {string} field - requested translatable field
    * @param {string} locale - locale to lookup
    * @return {string|undefined}
    */
    getTranslationForLocale: function (field, locale) {
      if (! _.has(this.translatable, field)) {
        return undefined;
      }

      if (_.isObject(this._translationVariations[locale]) && _.has(this._translationVariations[locale], field)) {
        return this._translationVariations[locale][field];
      }

      return undefined;
    },

    /**
    * Sets the translation version for the specified field
    * on currently set locale. Returns true if the field is translatable and
    * the value has been successfully associated with the locale
    * @param {*} value - translation version to set
    * @param {string} field
    * @return {boolean}
    */
    setTranslation: function (value, field) {
      if (! _.has(this.translatable, field)) {
        return false;
      }

      let locale = this.currentLocale;
      if (! locale || locale.length < 1) {
        locale = this.defaultLocale;
      }

      if (! _.has(this._translationVariations, locale)) {
        this._translationVariations[locale] = {};
      }

      this._translationVariations[locale][field] = value;
      return true;
    },

    /**
    * Sets the translation version for the specified field
    * on specified locale. Returns true if the field is translatable and
    * the value has been successfully associated with the locale
    * @param {*} value - translation version to set
    * @param {string} field
    * @param {string} locale
    * @return {boolean}
    */
    setTranslationForLocale: function (value, field, locale) {
      if (! _.has(this.translatable, field)) {
        return false;
      }

      if (! locale || locale.length < 1) {
        locale = this.defaultLocale;
      }

      this._translationVariations[locale][field] = value;
      return true;
    },

    saveTranslations: function (options) {
      let promises = [];

      for (let locale in this._translationVariations) {
        promises.push(this.getSaveLocalePromise_(locale, this._translationVariations[locale], options));
      }

      return Promise.all(promises);
    },

    getSaveLocalePromise_: function (locale, data, options) {
      let attrs = _.extend({}, data, {'for_id': this.get(this.idAttribute), 'locale': locale});
      let self = this;
      return this._knex_locale.insert(attrs)
      .then(function () {
        return locale;
      })
      .catch( function (err) {
        return self._knex_locale
          .where({'locale': locale, 'for_id': self.get(self.idAttribute)})
          .update(data)
          .then(function () {
            return locale;
          });
      });
    },

    fetchTranslatable: function (model) {
      return model._knex_locale
        .where({'for_id': model.get(model.idAttribute)})
        .select()
        .then(function (rows) {
          for (let i = 0; i < rows.length; i += 1) {
            let {locale} = rows[i];
            const data = _.omit(rows[i], ['for_id', 'locale']);
            model._translationVariations[locale] = data;
          }
          return model;
        });
    },

    validateSave: function (model, attrs, options) {
      var validation
      // model is not new or update method explicitly set
      if ((model && !model.isNew()) || (options && (options.method === 'update' || options.patch === true))) {
        var schemaKeys = this.validate._inner.children.map(function (child) {
          return child.key
        })
        var presentKeys = Object.keys(attrs)
        var optionalKeys = difference(schemaKeys, presentKeys)
        // only validate the keys that are being updated
        validation = Joi.validate(
          attrs,
          optionalKeys.length
            // optionalKeys() doesn't like empty arrays
            ? this.validate.optionalKeys(optionalKeys)
            : this.validate
        )
      } else {
        let variations = this._translationVariations[this.currentLocale] || {};
        validation = Joi.validate(Object.assign({}, this.attributes, variations), this.validate)
      }

      if (validation.error) {
        validation.error.tableName = this.tableName

        throw validation.error
      } else {
        this.set(validation.value)
        return validation.value
      }
    }

  });

  Bookshelf.Model = Model;
};
