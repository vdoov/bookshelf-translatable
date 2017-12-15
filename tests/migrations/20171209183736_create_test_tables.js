
exports.up = function(knex, Promise) {
  return knex.schema.createTable('translatable_table', function (table) {
    table.increments('id');
    table.string('name');
  })
  .then(() => {
    return knex.schema.createTable('translatable_table_locale', function (table) {
      table.integer('for_id');
      table.foreign('for_id').references('translatable_table.id').onDelete('CASCADE');
      table.string('locale');
      table.string('attrOne');
      table.string('attrTwo');
      table.string('attrThree');
      table.unique(['for_id', 'locale']);
    });
  });
};

exports.down = function(knex, Promise) {
  return knex.schema.dropTable('translatable_table')
  .then( () => {
    return knex.schema.dropTable('translatable_table_locale')
  });
};
