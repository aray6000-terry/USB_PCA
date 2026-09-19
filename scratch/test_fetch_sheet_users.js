const googleSheetService = require('../server/services/googleSheetService');
const db = require('../server/db');

async function main() {
  console.log('Testing fetchUsersFromSheet()...');
  try {
    const users = await googleSheetService.fetchUsersFromSheet();
    console.log('Total users fetched from Sheet:', users.length);
    if (users.length > 0) {
      console.log('Sample users from Sheet:');
      console.log(users.slice(0, 5));
    } else {
      console.log('No users returned (GAS may need to be updated with Code.gs get_users support)');
    }
  } catch (err) {
    console.error('Error fetching users:', err);
  }
}

main();
