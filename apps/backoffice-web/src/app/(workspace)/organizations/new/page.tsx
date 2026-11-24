import { redirect } from 'next/navigation'

// Creating a gym is a dialog over the directory now; the old address opens it there.
export default function NewOrganizationPage() {
  redirect('/organizations?new=1')
}
