const expect = require('chai').expect;

const dbConfig = {
  client: 'postgresql',
  connection: {
    host: '127.0.0.1',
    database: 'translatable_test',
    user:     'test_user',
    password: 'test_user'
  },
  pool: {
    min: 2,
    max: 10
  }
};

let TestModel;

const knex = require('knex')(dbConfig);
const Bookshelf = require('bookshelf')(knex);

const tableName = 'translatable_table';

describe('Bookshelf-translatable model attributes', function() {

  it('Should be able to add bookshelf-translatable plugin to Bookshelf', function () {
    const translatablePlugin = require('../index');
    Bookshelf.plugin(translatablePlugin);
  });

  it('Should be able to create model with translatable attributes', function () {
    TestModel = Bookshelf.Model.extend({

      tableName: tableName,

      translatable: {
        'attrOne': 'attrOne',
        'attrTwo': 'attrTwo',
        'attrThree': 'attrThree'
      }

    });

    const model = new TestModel();
  });

  it('#getLocale()', function () {
    const model = new TestModel();
    expect(model.getLocale()).to.be.a('string');
  });

  it('#setLocale()', function () {
    const model = new TestModel();
    model.setLocale('de');
    expect(model.getLocale()).to.equal('de');
  });

  it('setter/getter on translatable attributes for various locales', function () {
    const model = new TestModel();
    model.setLocale('en');
    model.set('attrOne', 'English version');
    expect(model.get('attrOne')).to.equal('English version');
    model.setLocale('de');
    model.set('attrOne', 'Deutsch version');
    expect(model.get('attrOne')).to.equal('Deutsch version');
    model.setLocale('en');
    expect(model.get('attrOne')).to.equal('English version');

    model.set({attrOne: '1: English version', attrTwo: '2: English version', attrThree: '3: English version'});
    expect(model.get('attrOne')).to.equal('1: English version');
    expect(model.get('attrTwo')).to.equal('2: English version');
    expect(model.get('attrThree')).to.equal('3: English version');

    model.setLocale('de');
    model.set({attrOne: '1: Deutsch version', attrTwo: '2: Deutsch version', attrThree: '3: Deutsch version'});
    expect(model.get('attrOne')).to.equal('1: Deutsch version');
    expect(model.get('attrTwo')).to.equal('2: Deutsch version');
    expect(model.get('attrThree')).to.equal('3: Deutsch version');

    model.setLocale('en');
    expect(model.get('attrOne')).to.equal('1: English version');
    expect(model.get('attrTwo')).to.equal('2: English version');
    expect(model.get('attrThree')).to.equal('3: English version');
  });

  it ('fallback locale test', function () {
    const model = new TestModel();
    model.set({attrOne: '1: English version', attrTwo: '2: English version', attrThree: '3: English version'});
    model.setLocale('it');
    expect(model.get('attrOne')).to.equal('1: English version');
    expect(model.get('attrTwo')).to.equal('2: English version');
    expect(model.get('attrThree')).to.equal('3: English version');
  });

  it ('Should be able to save localized fields to database', function (done) {
    const model = new TestModel();
    let createdId;

    model.setLocale('en');
    model.set({
      attrOne: '1: English version',
      attrTwo: '2: English version',
      attrThree: '3: English version',
      name: 'test'
    }).save()
    .then( (model) => {
      createdId = model.get(model.idAttribute);
      return TestModel.forge({id: createdId}).fetch({require: true});
    })
    .then( (newModel) => {
      expect(newModel.get('name')).to.equal(model.get('name'));
      expect(newModel.get('attrOne')).to.equal(model.get('attrOne'));
      expect(newModel.get('attrTwo')).to.equal(model.get('attrTwo'));
      expect(newModel.get('attrThree')).to.equal(model.get('attrThree'));

      newModel.setLocale('de');
      return newModel.save({
        attrOne: '1: Deutsch version',
        attrTwo: '2: Deutsch version',
        attrThree: '3: Deutsch version',
      });

    })
    .then( () => {
      return TestModel.forge({id: createdId}).fetch({require: true});
    })
    .then( (newModel) => {
      newModel.setLocale('en');
      expect(newModel.get('attrOne')).to.equal('1: English version');
      expect(newModel.get('attrTwo')).to.equal('2: English version');
      expect(newModel.get('attrThree')).to.equal('3: English version');

      newModel.setLocale('de');
      expect(newModel.get('attrOne')).to.equal('1: Deutsch version');
      expect(newModel.get('attrTwo')).to.equal('2: Deutsch version');
      expect(newModel.get('attrThree')).to.equal('3: Deutsch version');
      done();
    })
    .catch(err => {
      done(err);
    });

  });

  it ('Should be able to update localized fields saved to database', function (done) {
    const model = new TestModel();
    let createdId;

    model.setLocale('en');
    model.set({
      attrOne: '1: English version',
      attrTwo: '2: English version',
      attrThree: '3: English version',
      name: 'test'
    }).save()
    .then( (model) => {
      createdId = model.get(model.idAttribute);
      return TestModel.forge({id: createdId}).fetch({require: true});
    })
    .then( (newModel) => {
      expect(newModel.get('name')).to.equal(model.get('name'));
      expect(newModel.get('attrOne')).to.equal(model.get('attrOne'));
      expect(newModel.get('attrTwo')).to.equal(model.get('attrTwo'));
      expect(newModel.get('attrThree')).to.equal(model.get('attrThree'));

      newModel.setLocale('en');
      return newModel.save({
        attrOne: '1: English version 2',
        attrTwo: '2: English version 2'
      });
    })
    .then( () => {
      return TestModel.forge({id: createdId}).fetch({require: true});
    })
    .then( (newModel) => {
      newModel.setLocale('en');
      expect(newModel.get('attrOne')).to.equal('1: English version 2');
      expect(newModel.get('attrTwo')).to.equal('2: English version 2');
      expect(newModel.get('attrThree')).to.equal('3: English version');

      done();
    })
    .catch(err => {
      done(err);
    });
  });

  it ('Translatable fields should be exposed to .serialize() method', function () {
    const model = new TestModel();

    model.setLocale('en');
    model.set({
      attrOne: '1: English version',
      attrTwo: '2: English version',
      attrThree: '3: English version',
      name: 'test'
    });

    let serialized = model.serialize();
    expect(serialized.attrOne).to.equal('1: English version');
    expect(serialized.attrTwo).to.equal('2: English version');
    expect(serialized.attrThree).to.equal('3: English version');

    model.setLocale('de');
    model.set({
      attrOne: '1: Deutsch version',
      attrTwo: '2: Deutsch version',
      attrThree: '3: Deutsch version',
      name: 'test'
    });

    serialized = model.serialize();
    expect(serialized.attrOne).to.equal('1: Deutsch version');
    expect(serialized.attrTwo).to.equal('2: Deutsch version');
    expect(serialized.attrThree).to.equal('3: Deutsch version');

    model.setLocale('en');
    serialized = model.serialize();
    expect(serialized.attrOne).to.equal('1: English version');
    expect(serialized.attrTwo).to.equal('2: English version');
    expect(serialized.attrThree).to.equal('3: English version');
  });

});
