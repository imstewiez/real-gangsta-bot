'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

// We need to mock config before requiring the permission engine
mock.module('../src/config', {
  namedExports: {},
  defaultExport: {
    CHEFIA_ROLE_ID: 'role_chefia',
    CHEFE_MORADORES_ROLE_ID: 'role_chefe_mor',
    OFICIAL_ROLE_ID: 'role_oficial',
    MORADOR_ROLE_ID: 'role_morador',
    BOT_COLOR: 0xE74C3C,
    BOT_DISPLAY_NAME: 'Real Gangsta',
  }
});

describe('Permissions', () => {
  function mockMember(roleIds) {
    return {
      roles: {
        cache: {
          map: (fn) => roleIds.map((id, i) => fn({ id }, i)),
          has: (id) => roleIds.includes(id),
        }
      }
    };
  }

  it('should identify chefia role', () => {
    const { isChefia } = require('../src/permissions/permissionEngine');

    const member = mockMember(['role_chefia']);
    assert.ok(isChefia(member));
  });

  it('should not identify morador as chefia', () => {
    const { isChefia } = require('../src/permissions/permissionEngine');

    const member = mockMember(['role_morador']);
    assert.ok(!isChefia(member));
  });

  it('should allow chefe moradores to view all members', () => {
    const { canViewAllMembers } = require('../src/permissions/permissionEngine');

    const member = mockMember(['role_chefe_mor']);
    assert.ok(canViewAllMembers(member));
  });

  it('should get highest role correctly', () => {
    const { getHighestRole } = require('../src/permissions/permissionEngine');

    assert.equal(getHighestRole(mockMember(['role_chefia', 'role_oficial'])), 'chefia');
    assert.equal(getHighestRole(mockMember(['role_oficial', 'role_morador'])), 'oficial');
    assert.equal(getHighestRole(mockMember(['role_morador'])), 'morador');
    assert.equal(getHighestRole(mockMember([])), null);
  });
});
