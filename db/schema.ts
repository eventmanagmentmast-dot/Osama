import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{kind:text('kind').notNull(),id:text('id').notNull(),payload:text('payload').notNull()},t=>[primaryKey({columns:[t.kind,t.id]})]);
export const members=sqliteTable('members',{email:text('email').primaryKey(),role:text('role').notNull()});
export const state=sqliteTable('state',{id:integer('id').primaryKey(),revision:integer('revision').notNull().default(0),token:text('token').notNull().default('')});
export const audit=sqliteTable('audit',{id:text('id').primaryKey(),at:text('at').notNull(),actor:text('actor').notNull(),action:text('action').notNull()});
