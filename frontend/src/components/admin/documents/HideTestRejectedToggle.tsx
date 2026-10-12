import { Switch } from '@/components/ui/switch'
import { useSearchParams } from 'react-router-dom'

// TEMP: hides fully reviewed Tsenlek (mmBERT test) documents with rejected segments,
// which nobody works on and so look stuck to reviewers. Remove once there is a decision on them.

/** On unless the URL explicitly has hide_test_rejected=false. */
export function isHideTestRejected(params: URLSearchParams) {
    return params.get('hide_test_rejected') !== 'false'
}

function HideTestRejectedToggle() {
    const [params, setParams] = useSearchParams()
    const checked = isHideTestRejected(params)
    const setHidden = (hidden: boolean) => {
        if (hidden) params.delete('hide_test_rejected')
        else params.set('hide_test_rejected', 'false')
        params.set('page', '1')
        setParams(params)
    }
  return (
    <div className='border border-gray-200 rounded-md p-2'>
       <label htmlFor="admin-hide-test-rejected" className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <Switch
              id="admin-hide-test-rejected"
              className='cursor-pointer'
              checked={checked}
              onCheckedChange={(value) => setHidden(value === true)}
            />
            Hide test rejected
          </label>
    </div>
  )
}

export default HideTestRejectedToggle
