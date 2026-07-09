import { serve } from 'inngest/vercel'
import { inngest } from './_lib/inngest-client.js'
import { detectPageChanges, sendHourlyDigest } from './_lib/inngest-functions.js'

export const config = {
  api: { bodyParser: false },
}

export default serve({
  client: inngest,
  functions: [detectPageChanges, sendHourlyDigest],
})
