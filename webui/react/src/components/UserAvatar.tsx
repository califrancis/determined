import React, { useEffect, useState } from 'react';

import { useStore } from 'contexts/Store';
import { useFetchUsers } from 'hooks/useFetch';
import Avatar, { Props } from 'shared/components/Avatar';
import { getDisplayName } from 'utils/user';

const UserAvatar: React.FC<{
  userId?: number;
} & Omit<Props, 'darkLight' | 'displayName'>> = ({ userId, ...rest }) => {
  const [ displayName, setDisplayName ] = useState('');
  const { ui, users } = useStore();
  const fetchUsers = useFetchUsers(new AbortController());

  useEffect(() => {
    if (!userId) return;
    if (!users.length) fetchUsers();
    const user = users.find(user => user.id === userId);
    setDisplayName(getDisplayName(user));
  }, [ fetchUsers, userId, users ]);

  return <Avatar {...rest} darkLight={ui.darkLight} displayName={displayName} />;
};

export default UserAvatar;
