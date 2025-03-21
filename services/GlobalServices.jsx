import axios from "axios";

export const getToken = async () => {
  try {
    const result = await axios.get("/api/getToken");
    if (!result.data || !result.data.apiKey) {
      throw new Error("No API key received from server");
    }
    return result.data;
  } catch (error) {
    console.error(
      "Error getting API key:",
      error.response?.data || error.message
    );
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.details ||
      error.message ||
      "Failed to get API key";
    throw new Error(errorMessage);
  }
};
