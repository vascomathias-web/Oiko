import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  const [parametres, setParametres] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadParametres = useCallback(async () => {
    if (window.api) {
      const params = await window.api.parametres.getAll();
      setParametres(params);
      setTheme(params.theme || 'dark');
      document.documentElement.setAttribute('data-theme', params.theme || 'dark');
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (window.api) {
      const notifs = await window.api.notifications.getAll();
      setNotifications(notifs);
    }
  }, []);

  useEffect(() => {
    loadParametres();
    loadNotifications();
  }, [loadParametres, loadNotifications]);

  const updateTheme = async (newTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    await window.api.parametres.set('theme', newTheme);
    setParametres(prev => ({ ...prev, theme: newTheme }));
  };

  const updateParametre = async (cle, valeur) => {
    await window.api.parametres.set(cle, valeur);
    setParametres(prev => ({ ...prev, [cle]: valeur }));
  };

  const addNotification = async (data) => {
    await window.api.notifications.add(data);
    await loadNotifications();

    // Son si activé
    if (parametres.notifications_sonores === 'true') {
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
        audio.volume = 0.2;
        audio.play().catch(() => {});
      } catch {}
    }
  };

  return (
    <AppContext.Provider value={{
      theme, updateTheme,
      parametres, updateParametre, loadParametres,
      notifications, loadNotifications, addNotification,
      loading, setLoading
    }}>
      {children}
    </AppContext.Provider>
  );
}
