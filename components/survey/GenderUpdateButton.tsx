'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export const GenderUpdateButton = () => {
  const { user } = useAuth()
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [isUpdating, setIsUpdating] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const handleUpdateGender = async () => {
    if (!user) {
      setMessage({ 
        text: 'You need to be logged in to update your gender preference.', 
        type: 'error' 
      })
      return
    }

    setIsUpdating(true)
    setMessage(null)

    try {
      const supabase = createClient()
      
      // Update the gender field directly without checking for existing data
      // Since we know the data exists (the graph is visible)
      const { error: updateError } = await supabase
        .from('user_pvq_responses')
        .update({ gender })
        .eq('user_id', user.id)
      
      if (updateError) {
        console.error("Error details:", updateError)
        
        // If the gender column doesn't exist yet, show a specific message
        if (updateError.message?.includes("gender") && updateError.message?.includes("column")) {
          setMessage({ 
            text: 'The gender column is missing in the database. Run the database migration script first.', 
            type: 'error' 
          })
          return
        }
        
        throw updateError
      }
      
      setMessage({ 
        text: `Gender successfully updated to ${gender}. Refresh the page to see updated questions.`, 
        type: 'success' 
      })
    } catch (error) {
      console.error('Error updating gender:', error)
      setMessage({ 
        text: 'Failed to update gender. Please try again or contact support.', 
        type: 'error' 
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold mb-3">Update Gender Preference</h3>
      <p className="mb-3 text-sm text-gray-600">
        Update your gender preference without retaking the survey.
      </p>
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
        <div className="flex gap-4">
          <label 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setGender('male')}
          >
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              gender === 'male' 
                ? 'border-green-600 bg-white' 
                : 'border-gray-300 bg-white'
            }`}>
              {gender === 'male' && (
                <span className="w-2.5 h-2.5 rounded-full bg-green-600" />
              )}
            </span>
            <span className="text-gray-700">Male</span>
          </label>
          <label 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setGender('female')}
          >
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              gender === 'female' 
                ? 'border-green-600 bg-white' 
                : 'border-gray-300 bg-white'
            }`}>
              {gender === 'female' && (
                <span className="w-2.5 h-2.5 rounded-full bg-green-600" />
              )}
            </span>
            <span className="text-gray-700">Female</span>
          </label>
        </div>
        
        <Button 
          onClick={handleUpdateGender} 
          disabled={isUpdating}
          className="whitespace-nowrap"
        >
          {isUpdating ? 'Updating...' : 'Update Gender'}
        </Button>
      </div>
      
      {message && (
        <div className={`p-2 rounded text-sm ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  )
} 