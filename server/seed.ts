import { db } from './db';
import { managers, settings } from '@shared/schema';

async function seed() {
  console.log('Seeding fictional HirePass demo data...');

  const managersData = [
    {
      name: 'Amina Patel',
      jobTitle: 'Operations Director',
      email: 'amina.patel@hirepass.example',
      department: 'Operations',
      canBeHiringManager: true,
      canBeInterviewer: true,
    },
    {
      name: 'Daniel Morgan',
      jobTitle: 'Finance Lead',
      email: 'daniel.morgan@hirepass.example',
      department: 'Finance',
      canBeHiringManager: true,
      canBeInterviewer: true,
    },
    {
      name: 'Leila Haddad',
      jobTitle: 'People Partner',
      email: 'leila.haddad@hirepass.example',
      department: 'People',
      canBeHiringManager: false,
      canBeInterviewer: true,
    },
  ];

  for (const manager of managersData) {
    try {
      await db.insert(managers).values(manager).onConflictDoNothing();
      console.log(`Added fictional manager: ${manager.name}`);
    } catch (error) {
      console.log(`Fictional manager ${manager.name} may already exist`);
    }
  }

  const settingsData = [
    { key: 'company_name', value: 'HirePass Demo Company', description: 'Company name' },
    { key: 'company_brand', value: 'HirePass', description: 'Brand name' },
    { key: 'company_location', value: 'Dubai, UAE', description: 'Primary location' },
    { key: 'company_industry', value: 'Professional services', description: 'Industry' },
    { key: 'currency', value: 'AED', description: 'Default currency' },
    { key: 'probation_months', value: '6', description: 'Standard probation period' },
    { key: 'notice_period_days', value: '30', description: 'Standard notice period' },
    { key: 'annual_leave_days', value: '25', description: 'Annual leave entitlement' },
    { key: 'pass_id_prefix', value: 'HP', description: 'Recruitment pass ID prefix' },
    { key: 'soft_skills_form_url', value: 'https://example.com/hirepass-demo-form', description: 'Demo assessment URL' },
  ];

  for (const setting of settingsData) {
    try {
      await db.insert(settings).values(setting).onConflictDoNothing();
      console.log(`Added setting: ${setting.key}`);
    } catch (error) {
      console.log(`Setting ${setting.key} may already exist`);
    }
  }

  console.log('Fictional HirePass seeding complete.');
}

seed().catch(console.error);
