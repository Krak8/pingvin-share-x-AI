import useConfig from "./config.hook";

/**
 * Returns a function that resolves the public URL of this instance: the
 * configured app URL, or the address the page is opened with as long as the
 * app URL is still the default. It is a function because `window` is only
 * available in the browser.
 */
const useBaseUrl = () => {
  const config = useConfig();

  return () => {
    const appUrl: string = config.get("general.appUrl");
    return appUrl !== config.get("general.appUrl", true)
      ? appUrl
      : window.location.origin;
  };
};

export default useBaseUrl;
