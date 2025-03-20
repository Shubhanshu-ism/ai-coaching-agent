import React from 'react'
import FeatureAssistent from './_component/FeatureAssistent'
import History from './_component/History'
import Feedback from './_component/Feedback'

function DashBoard() {
  return (
    <div>
        <FeatureAssistent/>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-10 mt-20'>
            <History/>
            <Feedback/>
        </div>
    </div>
  )
}

export default DashBoard